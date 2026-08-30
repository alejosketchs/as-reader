// AS READER — función serverless: definición corta de una palabra vía Gemini.
// La API key vive solo aquí (variable de entorno de Vercel), nunca en el cliente.
// Si algo falla (sin key, sin cuota, sin red) responde definition:'' y el cliente
// deja que el usuario la escriba a mano — el glosario nunca se bloquea por esto.

const MODEL = 'gemini-3.6-flash';

/* Da más margen a la función serverless: Gemini a veces tarda más de los
   10s por defecto y la función moría a medias, dejando el glosario con
   la búsqueda "en blanco" sin ningún error visible. */
export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ definition: '' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const word = (req.body?.word || '').toString().trim().slice(0, 60);
  const context = (req.body?.context || '').toString().trim().slice(0, 120);

  if (!apiKey || !word) {
    res.status(200).json({ definition: '' });
    return;
  }

  const prompt = context
    ? `Da el significado de la palabra "${word}". Empieza siempre por su significado literal más común, el que daría un diccionario (1-2 frases) — nunca lo omitas ni lo reemplaces por un modismo, expresión figurada o sentido menos habitual, aunque creas que ese es el que aplica en el libro. La palabra aparece en el libro "${context}": si tiene varios significados y alguno encaja especialmente con ese tipo de obra, menciónalo después del significado literal, en una frase aparte — pero sin empezar la respuesta con frases como "en el contexto de", "según el libro" o similares, ve directo a los significados. Si además tiene otros usos comunes conocidos (modismos, otro idioma, uso cotidiano distinto, nombre de una plataforma o servicio, etc.), añádelos también, cada uno en su propia frase separada por un salto de línea. Responde en español, sin comillas ni introducciones ni encabezados, máximo 90 palabras en total.`
    : `Explica la palabra "${word}". Primero da su significado principal (1-2 frases). Si la palabra también tiene otros significados o usos comunes conocidos (otro idioma, uso cotidiano distinto, nombre de una plataforma o servicio, etc.), añádelos después en una frase aparte, separada por un salto de línea. Responde en español, sin comillas ni introducciones ni encabezados, máximo 90 palabras en total.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 1000, temperature: 0.4,
          thinkingConfig: { thinkingLevel: 'LOW' },
        },
      }),
    });
    if (!r.ok) {
      const errBody = await r.text().catch(() => '');
      console.log('Gemini error:', r.status, errBody.slice(0, 300));
      res.status(200).json({ definition: '' });
      return;
    }
    const data = await r.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const text = parts.map((p) => p.text || '').join('');
    const definition = text.trim().replace(/^["“]|["”]$/g, '').slice(0, 700);
    res.status(200).json({ definition });
  } catch (err) {
    console.log('Gemini fetch threw:', err?.message || String(err));
    res.status(200).json({ definition: '' });
  }
}
