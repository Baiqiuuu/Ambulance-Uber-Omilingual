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

    // Use Whisper API to transcribe and detect language
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      response_format: 'verbose_json',
    });

    return NextResponse.json({
      success: true,
      language: transcription.language,
      text: transcription.text,
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
