// Backend Routing — forward the processed record to the Node.js backend.
const base = env.get('BACKEND_URL') || 'http://backend:4000';
msg.url = base + '/api/ingest';
msg.method = 'POST';
msg.headers = {
    'content-type': 'application/json',
    'x-ingest-token': env.get('INGEST_TOKEN') || 'dev-ingest-token'
};
const stats = flow.get('stats') || { processed: 0 };
stats.processed++;
flow.set('stats', stats);
node.status({ fill: 'green', shape: 'dot', text: `forwarded ${stats.processed}` });
return msg;
