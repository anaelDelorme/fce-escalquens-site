ALTER TABLE tournament_sales ADD COLUMN allow_cheque INTEGER NOT NULL DEFAULT 0 CHECK(allow_cheque IN (0,1));
ALTER TABLE tournament_sales ADD COLUMN cheque_payee TEXT NOT NULL DEFAULT '';
ALTER TABLE tournament_sales ADD COLUMN cheque_address TEXT NOT NULL DEFAULT '';
ALTER TABLE tournament_sales ADD COLUMN cheque_deadline INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tournament_registrations ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'helloasso' CHECK(payment_method IN ('helloasso','cheque'));
ALTER TABLE tournament_registrations ADD COLUMN cheque_snapshot TEXT NOT NULL DEFAULT '';
