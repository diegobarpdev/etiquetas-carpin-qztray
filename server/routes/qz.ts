import { createSign } from 'crypto';
import { Router, Request, Response } from 'express';
import { getOrCreateQzCertificate } from '../lib/qz-cert';

const router = Router();

/** Certificado público que QZ Tray usa para confiar en este server. */
router.get('/qz/cert', async (_req: Request, res: Response) => {
  try {
    const { certPem } = await getOrCreateQzCertificate();
    res.type('text/plain').send(certPem);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

/** Firma cada mensaje que qz-client.ts manda a QZ Tray, con la clave privada del server. */
router.post('/qz/sign', async (req: Request, res: Response) => {
  try {
    const message = typeof req.body?.message === 'string' ? req.body.message : '';
    if (!message) {
      res.status(400).json({ error: 'Falta message a firmar' });
      return;
    }
    const { keyPem } = await getOrCreateQzCertificate();
    const signature = createSign('RSA-SHA512').update(message).sign(keyPem).toString('base64');
    res.json({ signature });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

export default router;
