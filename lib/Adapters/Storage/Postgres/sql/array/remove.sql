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
