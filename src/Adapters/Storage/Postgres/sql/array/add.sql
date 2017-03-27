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
