-- Independent customer/club deliveries. No historical notifications are replayed.
ALTER TABLE outbox ADD COLUMN audience TEXT NOT NULL DEFAULT 'customer' CHECK(audience IN ('customer','club'));
ALTER TABLE outbox ADD COLUMN recipient TEXT NOT NULL DEFAULT '';
CREATE TRIGGER club_business_notification AFTER INSERT ON outbox
WHEN NEW.audience='customer' AND NEW.kind IN ('created','paid','payment') AND (SELECT kind FROM orders WHERE id=NEW.order_id)='tournament' AND EXISTS(SELECT 1 FROM module_imports WHERE id='v5.2')
BEGIN
 INSERT OR IGNORE INTO outbox(id,order_id,kind,audience,available_at)
 VALUES('club:'||NEW.id,NEW.order_id,NEW.kind,'club',NEW.available_at);
END;
CREATE TRIGGER club_survey_notification AFTER INSERT ON surveys
WHEN (SELECT kind FROM orders WHERE id=NEW.order_id)='tournament' AND EXISTS(SELECT 1 FROM module_imports WHERE id='v5.2')
BEGIN
 INSERT OR IGNORE INTO outbox(id,order_id,kind,audience,available_at)
 VALUES('club:survey:'||NEW.order_id,NEW.order_id,'survey','club',NEW.created_at);
END;
