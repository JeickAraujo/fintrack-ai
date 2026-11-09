export function getTelegramBotToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
}

/**
 * Envía un mensaje a un chat de Telegram formateado con HTML
 */
export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  parseMode: 'HTML' | 'Markdown' = 'HTML'
): Promise<boolean> {
  const token = getTelegramBotToken();
  if (!token) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN no configurado');
    return false;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[Telegram] Error enviando mensaje:', err);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Telegram] Excepción enviando mensaje:', err);
    return false;
  }
}

/**
 * Notifica al usuario que el bot está procesando o escribiendo
 */
export async function sendChatAction(
  chatId: string | number,
  action: 'typing' | 'record_voice' | 'upload_voice' = 'typing'
): Promise<void> {
  const token = getTelegramBotToken();
  if (!token) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        action,
      }),
    });
  } catch (err) {
    console.warn('[Telegram] Error enviando acción de chat:', err);
  }
}

/**
 * Descarga un archivo de audio/voz de Telegram dado su file_id
 */
export async function downloadTelegramFile(fileId: string): Promise<{ buffer: Buffer; fileName: string } | null> {
  const token = getTelegramBotToken();
  if (!token) return null;

  try {
    const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
    if (!fileRes.ok) return null;
    const fileJson = await fileRes.json();
    const filePath = fileJson.result?.file_path;
    if (!filePath) return null;

    const downloadRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
    if (!downloadRes.ok) return null;

    const arrayBuffer = await downloadRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const rawName = filePath.split('/').pop() || 'voice.ogg';
    const fileName = rawName.replace(/\.oga$/i, '.ogg');
    return { buffer, fileName };
  } catch (err) {
    console.error('[Telegram] Error descargando archivo de audio:', err);
    return null;
  }
}

/**
 * Transcribe un archivo de audio con Groq Whisper en tiempo récord
 */
export async function transcribeAudioWithGroq(audioBuffer: Buffer, fileName: string = 'voice.ogg'): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GROQ_API_KEY no configurado para transcripción de voz');
  }

  // Usar FormData nativo
  // Groq exige explícitamente extensiones como .ogg, .mp3, .wav (Telegram usa .oga internamente)
  const safeFileName = fileName.replace(/\.oga$/i, '.ogg');
  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: 'audio/ogg' });
  formData.append('file', blob, safeFileName);
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('language', 'es');
  formData.append('temperature', '0.0');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq Whisper error (${res.status}): ${errText}`);
  }

  const json = await res.json();
  return json.text?.trim() || '';
}

/**
 * Configura o actualiza el webhook oficial de Telegram
 */
export async function setTelegramWebhook(webhookUrl: string): Promise<{ ok: boolean; description?: string }> {
  const token = getTelegramBotToken();
  if (!token) return { ok: false, description: 'Token no configurado' };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
    return await res.json();
  } catch (err: any) {
    return { ok: false, description: err?.message || String(err) };
  }
}

/**
 * Obtiene el estado actual del webhook
 */
export async function getTelegramWebhookInfo(): Promise<any> {
  const token = getTelegramBotToken();
  if (!token) return { ok: false, description: 'Token no configurado' };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    return await res.json();
  } catch (err: any) {
    return { ok: false, description: err?.message || String(err) };
  }
}
