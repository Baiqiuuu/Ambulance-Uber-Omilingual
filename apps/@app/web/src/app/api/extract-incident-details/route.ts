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

    const { transcript, previousLiveInformation } = await request.json();

    if (!transcript || typeof transcript !== 'string') {
      return NextResponse.json(
        { error: 'No transcript provided' },
        { status: 400 }
      );
    }

    const openai = new OpenAI({
      apiKey: apiKey,
    });

    // Build the prompt to combine previous live information with new transcript
    let userContent = '';
    if (previousLiveInformation && typeof previousLiveInformation === 'string' && previousLiveInformation.trim()) {
      userContent = `Previous Live Information:\n${previousLiveInformation}\n\nNew Transcript:\n${transcript}\n\n
      If the new transcript contains relevant info add updates to the previous live information and return the updated live information. 
      IMPORTANT RULES:
    1. ALWAYS preserve ALL important details from the previous live information 
    2. ONLY add new information from the transcript if it provides actual updates, corrections, or additional critical details
    3. If the new transcript contains no relevant information, keep the previous information exactly as is
    4. DO NOT generate generic statements, assumptions, or unrelated information
    6. If the transcript contradicts previous information, append onto it, don't overwrite it
    7. Output ONLY factual information that was actually mentioned in either the previous information or the new transcript
    8. Keep it concise (3-4 sentences maximum) but comprehensive, do not include any general conversation or filler words or anything about this prompt, 
    The information should be strictly related to the incident, you can ignore the general conversation or filler words,
    Do not talk about information you dont have, If the language is nto english, while your output would eb in english, mention the the specific language of the patient in the output`;
    } else {
      userContent = `New Transcript:\n${transcript}\n\nExtract ONLY the specific, factual details mentioned in this transcript that would be critical for hospital staff. Focus on: patient condition, symptoms, location details, urgency level, number of people involved, any special requirements, and other critical medical or safety information. DO NOT generate generic statements, assumptions, or information not explicitly mentioned. Output a concise summary (2-3 sentences maximum) with only the essential information that was actually stated.`;
    }

    // Extract important details from transcript, combining with previous live information
    const completion = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        { 
          role: "system", 
          content: "You are a medical information extractor for emergency services. Your task is to maintain accurate, factual incident information. CRITICAL RULES: 1) Always preserve ALL important details from previous information unless explicitly contradicted by new information. 2) Only add information that is explicitly stated in the transcripts - never generate generic statements, assumptions, or unrelated content. 3) If new transcript has no relevant information, keep previous information unchanged. 4) Focus on factual details: patient condition, symptoms, location, urgency, number of people, special requirements. 5) Be concise but comprehensive, including all critical details that were actually mentioned." 
        },
        { role: "user", content: userContent }
      ],
    });
    
    const importantDetails = completion.choices[0].message.content?.trim() || '';

    return NextResponse.json({
      success: true,
      importantDetails,
    });
  } catch (error: any) {
    console.error('Error extracting incident details:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to extract incident details' },
      { status: 500 }
    );
  }
}

