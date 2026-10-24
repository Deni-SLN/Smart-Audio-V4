// Serverless endpoint untuk deployment (Vercel / Node HTTP handler): GET /api/gdrive?id=<FILE_ID>
import { handleGdrive } from '../server/gdrive-proxy.js';

export default handleGdrive;
