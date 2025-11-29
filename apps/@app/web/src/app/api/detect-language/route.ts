import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey || apiKey === 'YOUR_OPENAI_TOKEN') {
      return NextResponse.json(
        { error: 'OpenAI API key not configured. Please set OPENAI_API_KEY in your .env file.' },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }

    const openai = new OpenAI({
      apiKey: apiKey,
    });

    // Step 1: Transcribe audio to get original text and detected language
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      response_format: 'verbose_json',
    });

    const originalText = transcription.text;
    const detectedLanguage = (transcription as any).language || 'en';
    let translatedText = originalText;

    // Step 2: Translate using Chat Completion for better accuracy
    // Whisper's translation endpoint can be inconsistent for short segments
    if (originalText && originalText.trim().length > 0) {
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            { 
              role: "system", 
              content: "You are a precise translator. Translate the user's text into English. If the text is already English, just correct any grammar. Output ONLY the translation, no explanations." 
            },
            { role: "user", content: originalText }
          ],
          temperature: 0.3,
        });
        
        if (completion.choices[0].message.content) {
          translatedText = completion.choices[0].message.content;
        }
      } catch (translationError) {
        console.error('Translation error:', translationError);
        // Fallback to original text if translation fails
      }
    }

    return NextResponse.json({
      success: true,
      language: detectedLanguage,
      input: originalText,
      output: translatedText,
      // Keep text for backward compatibility
      text: translatedText,
      duration: (transcription as any).duration,
    });
  } catch (error: any) {
    console.error('Error detecting language:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to detect language' },
      { status: 500 }
    );
  }
}
