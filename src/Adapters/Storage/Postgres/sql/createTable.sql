CREATE TABLE IF NOT EXISTS ${joinTable:name}(
    "relatedId" varChar(120),
    "owningId" varChar(120),
    PRIMARY KEY("relatedId", "owningId")
);
