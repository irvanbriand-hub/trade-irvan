ALTER TABLE ak_broker_data 
ADD CONSTRAINT unique_user_date_ticker 
UNIQUE (user_id, tanggal, ticker);

ALTER TABLE ak_broker_scores 
ADD CONSTRAINT unique_score_user_date_ticker 
UNIQUE (user_id, tanggal, ticker);