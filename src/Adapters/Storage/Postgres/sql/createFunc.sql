-- Function to set a key on a nested JSON document

CREATE OR REPLACE FUNCTION json_object_set_key(
  "json"          jsonb,
  "key_to_set"    TEXT,
  "value_to_set"  anyelement
)
  RETURNS jsonb
  LANGUAGE sql
  IMMUTABLE
  STRICT
AS $function$
SELECT concat('{', string_agg(to_json("key") || ':' || "value", ','), '}')::jsonb
  FROM (SELECT *
          FROM jsonb_each("json")
         WHERE "key" <> "key_to_set"
         UNION ALL
        SELECT "key_to_set", to_json("value_to_set")::jsonb) AS "fields"
$function$;

CREATE OR REPLACE FUNCTION array_add(
  "array"   jsonb,
  "values"  jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  IMMUTABLE
  STRICT
AS $function$
  SELECT array_to_json(ARRAY(SELECT unnest(ARRAY(SELECT DISTINCT jsonb_array_elements("array")) ||  ARRAY(SELECT jsonb_array_elements("values")))))::jsonb;
$function$;

CREATE OR REPLACE FUNCTION array_add_unique(
  "array"   jsonb,
  "values"  jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  IMMUTABLE
  STRICT
AS $function$
  SELECT array_to_json(ARRAY(SELECT DISTINCT unnest(ARRAY(SELECT DISTINCT jsonb_array_elements("array")) ||  ARRAY(SELECT DISTINCT jsonb_array_elements("values")))))::jsonb;
$function$;

CREATE OR REPLACE FUNCTION array_remove(
  "array"   jsonb,
  "values"  jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  IMMUTABLE
  STRICT
AS $function$
  SELECT array_to_json(ARRAY(SELECT * FROM jsonb_array_elements("array") as elt WHERE elt NOT IN (SELECT * FROM (SELECT jsonb_array_elements("values")) AS sub)))::jsonb;
$function$;

CREATE OR REPLACE FUNCTION array_contains_all(
  "array"   jsonb,
  "values"  jsonb
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  STRICT
AS $function$
  SELECT RES.CNT = jsonb_array_length("values") FROM (SELECT COUNT(*) as CNT FROM jsonb_array_elements("array") as elt WHERE elt IN (SELECT jsonb_array_elements("values"))) as RES ;
$function$;

CREATE OR REPLACE FUNCTION array_contains(
  "array"   jsonb,
  "values"  jsonb
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  STRICT
AS $function$
  SELECT RES.CNT >= 1 FROM (SELECT COUNT(*) as CNT FROM jsonb_array_elements("array") as elt WHERE elt IN (SELECT jsonb_array_elements("values"))) as RES ;
$function$;
