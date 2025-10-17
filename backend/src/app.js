const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api', routes);

// Error handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;
