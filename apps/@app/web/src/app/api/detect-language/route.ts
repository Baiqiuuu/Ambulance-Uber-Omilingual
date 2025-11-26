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

    // Use Whisper API to translate to English
    // The translations endpoint always translates to English
    const translation = await openai.audio.translations.create({
      file: audioFile,
      model: 'whisper-1',
      response_format: 'verbose_json',
    });

    return NextResponse.json({
      success: true,
      // Translations endpoint doesn't always return detected language in the same way
      // But we can try to access it if available, or default to 'English (Translated)'
      language: (translation as any).language || 'en',
      text: translation.text,
      duration: (translation as any).duration,
    });
  } catch (error: any) {
    console.error('Error detecting language:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to detect language' },
      { status: 500 }
    );
  }
}
