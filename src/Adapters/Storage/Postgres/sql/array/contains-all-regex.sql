CREATE OR REPLACE FUNCTION array_contains_all_regex(
  "array"   jsonb,
  "values"  jsonb
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  STRICT
AS $function$
  SELECT CASE
	WHEN 0 = jsonb_array_length("values") THEN true = false
	ELSE (SELECT RES.CNT = jsonb_array_length("values") FROM (SELECT COUNT(*) as CNT FROM jsonb_array_elements_text("array") as elt WHERE elt LIKE ANY (SELECT jsonb_array_elements_text("values"))) as RES)
  END;
$function$;