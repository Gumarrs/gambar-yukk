-- =====================================================================
-- Gambar Bareng: pengaturan durasi + jumlah ronde
-- Jalankan di Supabase SQL Editor. Bagian 1-3 menambah data/fungsi baru;
-- bagian 3 MENGGANTI start_game, jadi baca catatan di sana dulu.
-- Disusun dari kode start_game yang Anda tempel. Belum diuji di database Anda.
-- =====================================================================

-- 1) Kolom baru di rooms ------------------------------------------------
-- total_rounds       : jumlah ronde per game
-- series_start_round : nomor ronde (global) tempat game saat ini dimulai.
--                      Nomor ronde tetap naik terus, jadi tidak bentrok dengan
--                      constraint unik (room_id, round_number) jika ada.
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS total_rounds integer NOT NULL DEFAULT 3
    CHECK (total_rounds BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS series_start_round integer NOT NULL DEFAULT 0;


-- 2) RPC baru: set_room_settings (hanya master) -------------------------
CREATE OR REPLACE FUNCTION public.set_room_settings(
  p_player_id uuid,
  p_secret_token text,
  p_round_duration_seconds integer,
  p_total_rounds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_room RECORD;
  v_finished BOOLEAN;
BEGIN
  PERFORM private.assert_guest_session(p_player_id, p_secret_token);

  SELECT *
  INTO v_room
  FROM public.rooms
  WHERE id = (SELECT room_id FROM public.players WHERE id = p_player_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room tidak ditemukan';
  END IF;

  IF v_room.master_player_id <> p_player_id THEN
    RAISE EXCEPTION 'Hanya Master yang dapat mengubah pengaturan';
  END IF;

  IF v_room.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Room sudah kedaluwarsa';
  END IF;

  v_finished := v_room.status = 'results'
    AND (v_room.current_round_number - v_room.series_start_round) >= v_room.total_rounds;

  IF NOT (v_room.status = 'waiting' OR v_finished) THEN
    RAISE EXCEPTION 'Pengaturan hanya bisa diubah sebelum game dimulai';
  END IF;

  IF p_round_duration_seconds IS NULL
     OR p_round_duration_seconds < 15 OR p_round_duration_seconds > 600 THEN
    RAISE EXCEPTION 'Durasi harus antara 15 dan 600 detik';
  END IF;

  IF p_total_rounds IS NULL OR p_total_rounds < 1 OR p_total_rounds > 10 THEN
    RAISE EXCEPTION 'Jumlah ronde harus antara 1 dan 10';
  END IF;

  UPDATE public.rooms
  SET round_duration_seconds = p_round_duration_seconds,
      total_rounds = p_total_rounds,
      -- Mengubah pengaturan setelah game selesai berarti memulai game baru.
      series_start_round = CASE WHEN v_finished
                                THEN v_room.current_round_number
                                ELSE v_room.series_start_round END
  WHERE id = v_room.id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'round_duration_seconds', p_round_duration_seconds,
    'total_rounds', p_total_rounds
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_room_settings(uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_room_settings(uuid, text, integer, integer) TO anon, authenticated;


-- 3) start_game: hormati jumlah ronde -----------------------------------
-- PENTING: ini MENGGANTI fungsi lama. Header (SECURITY DEFINER, SET search_path TO '')
-- sudah disamakan dengan fungsi-fungsi lain Anda (finish_round, submit_drawing, dst).
-- Karena search_path kosong, semua tabel di bawah ditulis lengkap dengan "public." / "private.".
-- Perubahan dibanding versi Anda hanya yang bertanda  -- BARU
CREATE OR REPLACE FUNCTION public.start_game(
  p_player_id uuid,
  p_secret_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_room RECORD;
    v_prompt_id UUID;
    v_round_id UUID;
    v_round_number INTEGER;
    v_now TIMESTAMPTZ := NOW();
    v_series_start INTEGER;   -- BARU
    v_played INTEGER;         -- BARU
    v_prompt RECORD;          -- dari versi Anda: detail gambar untuk dikirim ke klien
BEGIN
    PERFORM private.assert_guest_session(
        p_player_id,
        p_secret_token
    );

    SELECT *
    INTO v_room
    FROM public.rooms
    WHERE id = (
        SELECT room_id
        FROM public.players
        WHERE id = p_player_id
    )
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Room tidak ditemukan';
    END IF;

    IF v_room.master_player_id <> p_player_id THEN
        RAISE EXCEPTION 'Hanya Master yang dapat memulai game';
    END IF;

    IF v_room.expires_at <= v_now THEN
        RAISE EXCEPTION 'Room sudah kedaluwarsa';
    END IF;

    IF v_room.status NOT IN ('waiting', 'results') THEN
        RAISE EXCEPTION 'Game sedang berjalan';
    END IF;

    -- Check active players
    IF NOT EXISTS (
        SELECT 1
        FROM public.players
        WHERE room_id = v_room.id
          AND left_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Tidak ada pemain aktif';
    END IF;

    -- BARU: kalau semua ronde game ini sudah dimainkan, mulai game baru
    v_series_start := v_room.series_start_round;
    IF v_room.status = 'results'
       AND (v_room.current_round_number - v_series_start) >= v_room.total_rounds THEN
        v_series_start := v_room.current_round_number;
    END IF;
    v_played := v_room.current_round_number - v_series_start;

    -- Complete previous round
    IF v_room.status = 'results' THEN
        UPDATE public.game_rounds
        SET status = 'completed'
        WHERE room_id = v_room.id
          AND round_number = v_room.current_round_number
          AND status = 'results';
    END IF;

    -- Random active drawing prompt
    SELECT id
    INTO v_prompt_id
    FROM public.drawing_prompts
    WHERE is_active = TRUE
    ORDER BY random()
    LIMIT 1;

    IF v_prompt_id IS NULL THEN
        RAISE EXCEPTION 'Belum ada drawing prompt aktif';
    END IF;

    -- dari versi Anda: ambil detail gambar dari prompt yang terpilih
    SELECT *
    INTO v_prompt
    FROM public.drawing_prompts
    WHERE id = v_prompt_id;

    v_round_number := v_room.current_round_number + 1;
    v_round_id := gen_random_uuid();

    INSERT INTO public.game_rounds (
        id,
        room_id,
        round_number,
        prompt_id,
        status,
        countdown_started_at,
        drawing_started_at,
        drawing_ends_at
    )
    VALUES (
        v_round_id,
        v_room.id,
        v_round_number,
        v_prompt_id,
        'countdown',
        v_now,
        v_now + INTERVAL '3 seconds',
        v_now + INTERVAL '3 seconds'
            + (v_room.round_duration_seconds * INTERVAL '1 second')
    );

    UPDATE public.rooms
    SET
        status = 'countdown',
        current_round_number = v_round_number,
        series_start_round = v_series_start      -- BARU
    WHERE id = v_room.id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'round_id', v_round_id,
        'round_number', v_round_number,
        'round_in_game', v_played + 1,           -- BARU
        'total_rounds', v_room.total_rounds,     -- BARU
        'status', 'countdown',
        'countdown_started_at', v_now,
        'drawing_started_at', v_now + INTERVAL '3 seconds',
        'drawing_ends_at',
            v_now + INTERVAL '3 seconds'
            + (v_room.round_duration_seconds * INTERVAL '1 second'),
        'countdown_seconds', 3,
        'prompt', CASE
            WHEN v_prompt.id IS NOT NULL THEN jsonb_build_object(
                'id', v_prompt.id,
                'title', v_prompt.title,
                'image_url', v_prompt.image_url,
                'category', v_prompt.category
            )
            ELSE NULL
        END
    );
END;
$$;


-- 4) get_room_state: lihat 002_room_state_and_sync.sql
-- (jalankan SETELAH file ini, karena memakai kolom baru total_rounds / series_start_round).
