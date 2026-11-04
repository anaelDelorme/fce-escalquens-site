UPDATE coach_access SET enabled=0,code_hash='',version=lower(hex(randomblob(16))),updated_at=unixepoch() WHERE id=1;
