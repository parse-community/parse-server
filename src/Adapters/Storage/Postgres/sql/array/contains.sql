CREATE OR REPLACE FUNCTION array_contains(
  "array"   jsonb,
  "values"  jsonb
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  STRICT
AS $function$
  SELECT RES.CNT >= 1 FROM (SELECT COUNT(*) as CNT FROM jsonb_array_elements("array") as elt WHERE elt IN (SELECT jsonb_array_elements("values"))) as RES;
$function$;
