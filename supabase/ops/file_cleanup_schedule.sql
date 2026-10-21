-- Apply after the production cleanup endpoint is deployed and FILE_CLEANUP_SECRET
-- is configured both in Vercel and as the Vault secret xixi_file_cleanup_secret.
-- No user credentials or storage service keys are included in the scheduled SQL.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- Use synchronous HTTP in the dedicated cron worker. pg_net's managed queue
-- permissions cannot be tightened by the project postgres role; never put a
-- privileged Authorization header into that queue.
SELECT cron.schedule('xixi-file-retention-cleanup', '* * * * *', $job$
DO $cleanup$
DECLARE response extensions.http_response;
BEGIN
    IF EXISTS (SELECT 1 FROM agentscope.file_cleanup)
       OR EXISTS (
           SELECT 1 FROM agentscope.studio_files
           WHERE deleted_at IS NULL AND (
               expires_at::timestamptz <= now()
               OR created_at::timestamptz + CASE WHEN origin='artifact' THEN interval '7 days' ELSE interval '3 days' END <= now()
           )
       ) THEN
        PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '120000');
        SELECT * INTO response FROM extensions.http(ROW(
            'POST',
            'https://xixi.rest/internal/files/cleanup',
            ARRAY[extensions.http_header('Authorization', 'Bearer ' || (
                SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='xixi_file_cleanup_secret'
            ))],
            'application/json',
            '{}'
        )::extensions.http_request);
        IF response.status <> 200 THEN
            RAISE EXCEPTION 'File cleanup returned HTTP %', response.status;
        END IF;
    END IF;
END;
$cleanup$;
$job$);
-- cron.schedule updates the existing named job; reactivate after correction.
SELECT cron.alter_job(jobid, active:=true) FROM cron.job WHERE jobname='xixi-file-retention-cleanup';
