-- Function to set a key on a nested JSON document

CREATE OR REPLACE FUNCTION json_object_set_key(
  "json"        jsonb,
  key_to_set    TEXT,
  value_to_set  anyelement
)
  RETURNS jsonb
  LANGUAGE sql
  IMMUTABLE
  STRICT
AS $function$
SELECT concat('{', string_agg(to_json("key") || ':' || "value", ','), '}')::jsonb
  FROM (SELECT *
    FROM jsonb_each("json")
    WHERE key <> key_to_set
    UNION ALL
    SELECT key_to_set, to_json("value_to_set")::jsonb) AS fields
$function$;
