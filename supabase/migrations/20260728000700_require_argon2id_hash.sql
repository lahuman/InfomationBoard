alter table private.board_secrets
add constraint board_secrets_argon2id_hash
check (password_hash ~ '^\$argon2id\$');
