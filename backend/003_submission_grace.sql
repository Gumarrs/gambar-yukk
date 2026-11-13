-- =====================================================================
-- Gambar Bareng: tenggang pengiriman gambar (grace period)
-- Masalah: ronde ditutup tepat di drawing_ends_at, padahal gambar yang di-snapshot
-- saat waktu habis butuh beberapa detik untuk sampai ke server. Akibatnya dianggap "timeout".
-- Solusi: server menerima kiriman sampai drawing_ends_at + 5 detik. Kalau semua pemain
-- sudah mengirim, ronde tetap langsung selesai tanpa menunggu tenggang.
-- Disusun dari kode finish_round_internal dan submit_drawing yang Anda tempel.
-- Belum diuji di database Anda. Perubahan ditandai  -- BARU
-- Edge Function upload-drawing TIDAK perlu diubah (lihat catatan upsert di bawah).
-- =====================================================================

-- 1) private.finish_round_internal ------------------------------------------
CREATE OR REPLACE FUNCTION private.finish_round_internal(p_round_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_round RECORD;
    v_active_count INTEGER;
    v_submitted_count INTEGER;
    v_grace CONSTANT INTERVAL := INTERVAL '5 seconds';   -- BARU
BEGIN
    SELECT *
    INTO v_round
    FROM public.game_rounds
    WHERE id = p_round_id
    FOR UPDATE;

    IF NOT FOUND OR v_round.status IN ('results', 'completed') THEN
        RETURN FALSE;
    END IF;

    IF NOW() < v_round.drawing_started_at THEN
        RETURN FALSE;
    END IF;

    -- Update countdown to drawing
    UPDATE public.game_rounds
    SET status = 'drawing'
    WHERE id = p_round_id
      AND status = 'countdown';

    UPDATE public.rooms
    SET status = 'drawing'
    WHERE id = v_round.room_id
      AND current_round_number = v_round.round_number
      AND status = 'countdown';

    SELECT COUNT(*)::INTEGER
    INTO v_active_count
    FROM public.players
    WHERE room_id = v_round.room_id
      AND left_at IS NULL;

    SELECT COUNT(*)::INTEGER
    INTO v_submitted_count
    FROM public.drawings
    WHERE round_id = p_round_id;

    -- Everyone submitted
    IF v_active_count > 0
       AND v_submitted_count >= v_active_count THEN

        UPDATE public.game_rounds
        SET status = 'results'
        WHERE id = p_round_id;

        UPDATE public.rooms
        SET status = 'results'
        WHERE id = v_round.room_id
          AND current_round_number = v_round.round_number;

        RETURN TRUE;
    END IF;

    -- Time expired (plus grace): mark remaining active players as timeout
    IF NOW() >= v_round.drawing_ends_at + v_grace THEN      -- BARU (sebelumnya tanpa + v_grace)

        INSERT INTO public.drawings (
            room_id,
            round_id,
            player_id,
            status
        )
        SELECT
            v_round.room_id,
            p_round_id,
            p.id,
            'timeout'
        FROM public.players p
        WHERE p.room_id = v_round.room_id
          AND p.left_at IS NULL
        ON CONFLICT (round_id, player_id) DO NOTHING;

        UPDATE public.game_rounds
        SET status = 'results'
        WHERE id = p_round_id;

        UPDATE public.rooms
        SET status = 'results'
        WHERE id = v_round.room_id
          AND current_round_number = v_round.round_number;

        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$function$;


-- 2) public.submit_drawing -------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_drawing(p_player_id uuid, p_secret_token text, p_round_id uuid, p_storage_path text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_room_id UUID;
    v_round RECORD;
    v_expected_path TEXT;
    v_finished BOOLEAN;
    v_grace CONSTANT INTERVAL := INTERVAL '5 seconds';   -- BARU
BEGIN
    PERFORM private.assert_guest_session(
        p_player_id,
        p_secret_token
    );

    SELECT room_id
    INTO v_room_id
    FROM public.players
    WHERE id = p_player_id
      AND left_at IS NULL;

    v_expected_path :=
        v_room_id::TEXT || '/' ||
        p_round_id::TEXT || '/' ||
        p_player_id::TEXT || '.png';

    IF p_storage_path IS DISTINCT FROM v_expected_path THEN
        RAISE EXCEPTION 'Storage path tidak valid';
    END IF;

    SELECT *
    INTO v_round
    FROM public.game_rounds
    WHERE id = p_round_id
      AND room_id = v_room_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Round tidak ditemukan';
    END IF;

    IF v_round.status IN ('results', 'completed') THEN
        RAISE EXCEPTION 'Round sudah selesai';
    END IF;

    IF NOW() < v_round.drawing_started_at THEN
        RAISE EXCEPTION 'Waktu menggambar belum dimulai';
    END IF;

    IF NOW() >= v_round.drawing_ends_at + v_grace THEN      -- BARU (sebelumnya tanpa + v_grace)
        PERFORM private.finish_round_internal(p_round_id);

        RETURN jsonb_build_object(
            'success', FALSE,
            'reason', 'time_expired'
        );
    END IF;

    INSERT INTO public.drawings (
        room_id,
        round_id,
        player_id,
        storage_path,
        status
    )
    VALUES (
        v_room_id,
        p_round_id,
        p_player_id,
        p_storage_path,
        'submitted'
    )
    ON CONFLICT (round_id, player_id)
    DO UPDATE SET
        storage_path = EXCLUDED.storage_path,
        status = 'submitted',
        submitted_at = NOW();

    v_finished := private.finish_round_internal(p_round_id);

    RETURN jsonb_build_object(
        'success', TRUE,
        'round_finished', v_finished,
        'submitted_at', NOW()
    );
END;
$function$;


-- 3) Catatan untuk Edge Function upload-drawing (opsional, 1 baris) ----------
-- Di bagian upload ke Storage, ubah  upsert: false  menjadi  upsert: true
-- Alasannya: frontend mencoba ulang sampai 4 kali kalau jaringan putus. Kalau percobaan
-- pertama sebenarnya sudah masuk ke Storage tapi responsnya tidak sampai, percobaan kedua
-- akan gagal "resource already exists". Path-nya unik per pemain dan ronde, jadi upsert aman.
-- Fungsi itu memanggil sync_round_state (status masih 'drawing' selama tenggang) lalu
-- submit_drawing, jadi pemeriksaan waktunya otomatis ikut tenggang di atas.
