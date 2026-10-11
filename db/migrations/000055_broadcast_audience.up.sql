ALTER TABLE bot_broadcast_draft ADD COLUMN audience JSONB NOT NULL DEFAULT '{"category":"all","internalSquads":[],"externalSquads":[],"tag":"","language":""}';
ALTER TABLE email_broadcast ADD COLUMN audience JSONB NOT NULL DEFAULT '{"category":"all","internalSquads":[],"externalSquads":[],"tag":"","language":""}';
