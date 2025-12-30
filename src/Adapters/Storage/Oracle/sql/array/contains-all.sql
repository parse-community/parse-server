CREATE OR REPLACE FUNCTION array_contains_all(
  "array"   JSON,
  "values"  JSON
)
RETURN NUMBER
DETERMINISTIC
IS
  array_len NUMBER;
  values_len NUMBER;
  match_cnt NUMBER;
BEGIN
  SELECT JSON_ARRAY_LENGTH("values")
  INTO values_len
  FROM DUAL;
  
  IF values_len = 0 THEN
    RETURN 0;
  END IF;
  
  SELECT COUNT(DISTINCT arr.value)
  INTO match_cnt
  FROM JSON_TABLE("array", '$[*]' COLUMNS (value VARCHAR2(4000) PATH '$')) arr
  WHERE EXISTS (
    SELECT 1
    FROM JSON_TABLE("values", '$[*]' COLUMNS (val VARCHAR2(4000) PATH '$')) vals
    WHERE arr.value = vals.val
  );
  
  RETURN CASE WHEN match_cnt = values_len THEN 1 ELSE 0 END;
END;
/

