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
