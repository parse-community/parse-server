import express from 'express';
import { api } from './api';

var app = express();
app.use('/parse', api);

export { app };

