-- =====================================================================
-- Gambar Bareng: get_room_state + sync_round_state (versi lengkap)
-- Jalankan SETELAH 001_room_settings.sql (memakai kolom total_rounds dan series_start_round).
-- Disusun dari kode fungsi yang Anda tempel. Belum diuji di database Anda.
-- Perubahan ditandai  -- BARU
-- =====================================================================

-- get_room_state: tambah total_rounds dan round_in_game ke objek "room" ----
CREATE OR REPLACE FUNCTION public.get_room_state(p_player_id uuid, p_secret_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_room_id UUID;
    v_result JSONB;
BEGIN
    PERFORM private.assert_guest_session(
        p_player_id,
        p_secret_token
    );

    SELECT room_id
    INTO v_room_id
    FROM public.players
    WHERE id = p_player_id;

    SELECT jsonb_build_object(
        'room', jsonb_build_object(
            'id', r.id,
            'code', r.room_code,
            'status', r.status,
            'master_player_id', r.master_player_id,
            'max_players', r.max_players,
            'current_round_number', r.current_round_number,
            'round_duration_seconds', r.round_duration_seconds,
            'total_rounds', r.total_rounds,                                          -- BARU
            'round_in_game', r.current_round_number - r.series_start_round,          -- BARU
            'expires_at', r.expires_at
        ),

        'players', (
            SELECT COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'id', p.id,
                        'name', p.guest_name,
                        'avatar_key', p.avatar_key,
                        'is_ready', p.is_ready,
                        'is_master',
                            p.id = r.master_player_id,
                        'is_online',
                            p.last_seen_at > NOW() - INTERVAL '45 seconds'
                    )
                    ORDER BY p.joined_at
                ),
                '[]'::JSONB
            )
            FROM public.players p
            WHERE p.room_id = r.id
              AND p.left_at IS NULL
        ),

        'current_round', (
            SELECT jsonb_build_object(
                'id', gr.id,
                'round_number', gr.round_number,
                'status', gr.status,
                'prompt', jsonb_build_object(
                    'id', dp.id,
                    'title', dp.title,
                    'category', dp.category,
                    'image_url', dp.image_url,
                    'thumbnail_url', dp.thumbnail_url
                ),
                'countdown_started_at', gr.countdown_started_at,
                'drawing_started_at', gr.drawing_started_at,
                'drawing_ends_at', gr.drawing_ends_at
            )
            FROM public.game_rounds gr
            JOIN public.drawing_prompts dp
                ON dp.id = gr.prompt_id
            WHERE gr.room_id = r.id
              AND gr.round_number = r.current_round_number
            LIMIT 1
        )
    )
    INTO v_result
    FROM public.rooms r
    WHERE r.id = v_room_id;

    RETURN v_result;
END;
$function$;


-- sync_round_state: tambah server_time dan has_submitted ---------------------
-- server_time    : jam server, supaya timer di browser tidak melenceng kalau jam komputer pemain salah.
-- has_submitted  : supaya pemain yang me-refresh halaman tahu gambarnya sudah terkirim.
-- prompt.id      : ikut dikirim.
CREATE OR REPLACE FUNCTION public.sync_round_state(p_player_id uuid, p_secret_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_room_id UUID;
    v_round RECORD;
    v_prompt RECORD;
    v_finished BOOLEAN;
    v_has_submitted BOOLEAN;   -- BARU
BEGIN
    PERFORM private.assert_guest_session(
        p_player_id,
        p_secret_token
    );

    SELECT room_id
    INTO v_room_id
    FROM public.players
    WHERE id = p_player_id;

    SELECT *
    INTO v_round
    FROM public.game_rounds
    WHERE room_id = v_room_id
    ORDER BY round_number DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'status', 'waiting',
            'server_time', NOW()                      -- BARU
        );
    END IF;

    v_finished := private.finish_round_internal(v_round.id);

    SELECT *
    INTO v_round
    FROM public.game_rounds
    WHERE id = v_round.id;

    SELECT *
    INTO v_prompt
    FROM public.drawing_prompts
    WHERE id = v_round.prompt_id;

    -- BARU
    SELECT EXISTS (
        SELECT 1
        FROM public.drawings d
        WHERE d.round_id = v_round.id
          AND d.player_id = p_player_id
          AND d.status = 'submitted'
    )
    INTO v_has_submitted;

    RETURN jsonb_build_object(
        'success', TRUE,
        'round_id', v_round.id,
        'round_number', v_round.round_number,
        'status', v_round.status,
        'countdown_started_at', v_round.countdown_started_at,   -- BARU
        'drawing_started_at', v_round.drawing_started_at,
        'drawing_ends_at', v_round.drawing_ends_at,
        'server_time', NOW(),                                    -- BARU
        'has_submitted', v_has_submitted,                        -- BARU
        'finished', v_finished,
        'prompt', CASE
            WHEN v_prompt.id IS NOT NULL THEN jsonb_build_object(
                'id', v_prompt.id,                               -- BARU
                'title', v_prompt.title,
                'image_url', v_prompt.image_url,
                'category', v_prompt.category
            )
            ELSE NULL
        END
    );
END;
$function$;
