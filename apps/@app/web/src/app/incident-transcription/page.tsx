'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { io } from 'socket.io-client';

export default function IncidentTranscriptionPage() {
  const searchParams = useSearchParams();
  const incidentIdParam = searchParams.get('incidentId');
  
  const [incidentId, setIncidentId] = useState(incidentIdParam || '');
  const [incidents, setIncidents] = useState<Array<{ id: string; lat: number; lng: number; message?: string; liveInformation?: string }>>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [transcriptHistory, setTranscriptHistory] = useState<Array<{ id: string; timestamp: string; originalLang: string; originalText: string; translatedText: string }>>([]);
  const [detectedLanguages, setDetectedLanguages] = useState<Set<string>>(new Set());
  const [liveInformation, setLiveInformation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadingIncidents, setLoadingIncidents] = useState(true);
  
  const streamRef = useRef<MediaStream | null>(null);
  const isRecordingRef = useRef(false);
  const transcriptBufferRef = useRef<string[]>([]);
  const messageCountRef = useRef<number>(0);
  const socketRef = useRef<any>(null);

  // Fetch incidents and listen for updates via WebSocket
  useEffect(() => {
    const fetchIncidents = async () => {
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
        const response = await fetch(`${apiBase}/api/shared-locations`);
        const result = await response.json();
        
        if (result.success && result.locations) {
          console.log('Fetched incidents:', result.locations);
          setIncidents(result.locations);
          
          // If incidentId is set, load its liveInformation
          if (incidentIdParam) {
            const selectedIncident = result.locations.find((inc: any) => inc.id === incidentIdParam);
            if (selectedIncident?.liveInformation) {
              setLiveInformation(selectedIncident.liveInformation);
            }
          }
        } else {
          console.log('No incidents found or API error:', result);
        }
        setLoadingIncidents(false);
      } catch (error) {
        console.error('Error fetching incidents:', error);
        setLoadingIncidents(false);
      }
    };

    fetchIncidents();

    // Connect to WebSocket to get real-time incident updates
    const wsBase = process.env.NEXT_PUBLIC_WS_BASE || 'http://localhost:4000';
    const socket = io(wsBase, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('WebSocket connected for incident transcription');
    });

    socket.on('location:shared', (data: { id: string; lat: number; lng: number; message?: string; liveInformation?: string }) => {
      console.log('Received location:shared event:', data);
      setIncidents(prev => {
        const existing = prev.find(inc => inc.id === data.id);
        if (existing) {
          // Merge: preserve existing message if new data doesn't have one
          const merged = {
            ...existing,
            ...data,
            message: data.message !== undefined ? data.message : existing.message,
            liveInformation: data.liveInformation !== undefined ? data.liveInformation : existing.liveInformation,
          };
          return prev.map(inc => inc.id === data.id ? merged : inc);
        } else {
          // Add new incident
          return [...prev, data];
        }
      });
      
      // Update liveInformation if this is the selected incident
      if (data.id === incidentId && data.liveInformation) {
        setLiveInformation(data.liveInformation);
      }
    });

    return () => {
      socket.close();
    };
  }, []);

  const startRecording = async () => {
    if (!incidentId.trim()) {
      alert('Please enter an incident ID first');
      return;
    }

    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      isRecordingRef.current = true;
      setIsRecording(true);
      messageCountRef.current = 0;
      transcriptBufferRef.current = [];

      // Function to record segments
      const recordSegment = () => {
        if (!isRecordingRef.current) {
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
          }
          // No interval to clear - we trigger summaries based on message count
          return;
        }

        const mediaRecorder = new MediaRecorder(stream);
        const chunks: Blob[] = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(chunks, { type: 'audio/webm' });
          if (audioBlob.size > 0) {
            await transcribeAudio(audioBlob);
          }

          if (isRecordingRef.current) {
            recordSegment();
          }
        };

        mediaRecorder.start();
        setTimeout(() => {
          if (mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
          }
        }, 2000);
      };

      recordSegment();
    } catch (error) {
      console.error('Error starting recording:', error);
      setError('Failed to access microphone. Please grant permission.');
      setIsRecording(false);
      isRecordingRef.current = false;
    }
  };

  const stopRecording = async () => {
    setIsRecording(false);
    isRecordingRef.current = false;
    
    // Final summary before stopping if there are transcripts
    if (transcriptHistory.length > 0) {
      await summarizeAndUpdate();
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const response = await fetch('/api/detect-language', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        // Update language set if new language detected
        if (result.language) {
          setDetectedLanguages(prev => {
            const newSet = new Set(prev);
            newSet.add(result.language);
            return newSet;
          });
        }

        // Add to transcript history with language info
        if (result.input && result.output) {
          const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const newInput = result.input.trim();
          const newOutput = result.output.trim();
          
          if (newInput || newOutput) {
            const transcriptEntry = {
              id: Date.now().toString(),
              timestamp,
              originalLang: result.language || 'unknown',
              originalText: newInput,
              translatedText: newOutput
            };
            
            setTranscriptHistory(prev => {
              const newHistory = [...prev, transcriptEntry];
              // Increment message count and check if we should summarize
              messageCountRef.current += 1;
              if (messageCountRef.current >= 3 && isRecordingRef.current) {
                // Trigger summary after every 3 messages
                messageCountRef.current = 0; // Reset counter
                // Use the newHistory directly to ensure we have the latest transcripts
                setTimeout(() => {
                  // Pass the complete transcript history to summarizeAndUpdate
                  const completeTranscript = newHistory.map(entry => entry.translatedText).join(' ');
                  summarizeAndUpdate(completeTranscript);
                }, 100);
              }
              return newHistory;
            });
            transcriptBufferRef.current.push(newOutput);
          }
        } else if (result.text) {
          // Fallback for legacy response
          const newText = result.text.trim();
          if (newText) {
            const transcriptEntry = {
              id: Date.now().toString(),
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              originalLang: 'unknown',
              originalText: '',
              translatedText: newText
            };
            
            setTranscriptHistory(prev => {
              const newHistory = [...prev, transcriptEntry];
              // Increment message count and check if we should summarize
              messageCountRef.current += 1;
              if (messageCountRef.current >= 3 && isRecordingRef.current) {
                // Trigger summary after every 3 messages
                messageCountRef.current = 0; // Reset counter
                // Use the newHistory directly to ensure we have the latest transcripts
                setTimeout(() => {
                  // Pass the complete transcript history to summarizeAndUpdate
                  const completeTranscript = newHistory.map(entry => entry.translatedText).join(' ');
                  summarizeAndUpdate(completeTranscript);
                }, 100);
              }
              return newHistory;
            });
            transcriptBufferRef.current.push(newText);
          }
        }
      }
    } catch (error) {
      console.error('Error transcribing audio:', error);
    }
  };

  const summarizeAndUpdate = async (transcriptOverride?: string) => {
    // Use provided transcript or get from state
    let transcriptToUse: string;
    if (transcriptOverride) {
      transcriptToUse = transcriptOverride;
    } else {
      // Get current state - need to use a ref or wait for state update
      transcriptToUse = transcriptHistory.map(entry => entry.translatedText).join(' ');
    }
    
    if (!transcriptToUse || transcriptToUse.trim().length === 0) return;

    try {
      // Use the provided transcript or combine ALL transcripts from history
      const completeTranscript = transcriptToUse;
      
      // Get current incident to fetch existing liveInformation
      const currentIncident = incidents.find(inc => inc.id === incidentId);
      const previousLiveInformation = currentIncident?.liveInformation || liveInformation || '';
      
      // Extract important details from entire transcript, combining with previous live information
      const response = await fetch('/api/extract-incident-details', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          transcript: completeTranscript, // Send entire transcript history
          previousLiveInformation: previousLiveInformation
        }),
      });

      const result = await response.json();
      
      if (result.success && result.importantDetails) {
        // Update live information (combined with previous)
        setLiveInformation(result.importantDetails);
        
        // Get existing incident coordinates to preserve location
        const existingIncident = incidents.find(inc => inc.id === incidentId);
        if (!existingIncident) {
          console.error('Incident not found for live information update');
          return;
        }
        
        // Update incident via WebSocket/API - send as live information update
        // Use existing coordinates to preserve incident location
        // Send liveInformation separately, don't change the original message
        const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
        await fetch(`${apiBase}/api/share-location`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            lat: existingIncident.lat, // Preserve existing location
            lng: existingIncident.lng, // Preserve existing location
            vehicleId: incidentId,
            // Don't send message - preserve original message
            liveInformation: result.importantDetails, // Send liveInformation separately
          }),
        });

        // Don't clear buffer - we want to keep all transcripts for next summary
      }
    } catch (error) {
      console.error('Error summarizing transcript:', error);
    }
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-3xl shadow-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
              <svg className="w-10 h-10 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              Incident Transcription
            </h1>
            <button
              onClick={() => {
                stopRecording();
                window.close();
              }}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Incident Selection Dropdown */}
          <div className="mb-6">
            <label className="block text-sm font-bold text-slate-700 mb-2">Select Incident</label>
            {loadingIncidents ? (
              <div className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 text-center">
                Loading incidents...
              </div>
            ) : incidents.length === 0 ? (
              <div className="w-full px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-center">
                No incidents available
              </div>
            ) : (
              <select
                value={incidentId}
                onChange={(e) => {
                  setIncidentId(e.target.value);
                  // Load liveInformation when incident is selected
                  if (e.target.value) {
                    const selectedIncident = incidents.find(inc => inc.id === e.target.value);
                    if (selectedIncident?.liveInformation) {
                      setLiveInformation(selectedIncident.liveInformation);
                    } else {
                      setLiveInformation('');
                    }
                  } else {
                    setLiveInformation('');
                  }
                }}
                disabled={isRecording}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 appearance-none cursor-pointer"
              >
                <option value="">-- Select an incident --</option>
                {incidents.map((incident) => (
                  <option key={incident.id} value={incident.id}>
                    {incident.id}{incident.message ? ` - ${incident.message}` : ''}
                  </option>
                ))}
              </select>
            )}
            {incidentId && (
              <div className="mt-2 text-xs text-green-600">
                ✓ Incident selected
              </div>
            )}
          </div>

          {/* Recording Controls */}
          <div className="flex gap-3">
            {!isRecording ? (
              <button
                onClick={startRecording}
                disabled={!incidentId.trim()}
                className="flex-1 px-6 py-4 bg-purple-500 text-white rounded-xl font-bold shadow-lg shadow-purple-500/20 hover:bg-purple-600 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                Start Transcription
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="flex-1 px-6 py-4 bg-rose-500 text-white rounded-xl font-bold shadow-lg shadow-rose-500/20 hover:bg-rose-600 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 animate-pulse"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>
                Stop Transcription
              </button>
            )}
          </div>

          {error && (
            <div className="mt-4 bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Detected Languages */}
        {detectedLanguages.size > 0 && (
          <div className="bg-white rounded-3xl shadow-2xl p-6 mb-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Detected Languages</h2>
            <div className="flex flex-wrap gap-2">
              {Array.from(detectedLanguages).map((lang) => (
                <span key={lang} className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">
                  {lang}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Live Information Section */}
        {liveInformation && (
          <div className="bg-white rounded-3xl shadow-2xl p-6 mb-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></span>
              Live Information
            </h2>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="text-sm text-slate-700 whitespace-pre-wrap">{liveInformation}</div>
            </div>
          </div>
        )}

        {/* Transcript History */}
        {transcriptHistory.length > 0 && (
          <div className="bg-white rounded-3xl shadow-2xl p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Transcript History</h2>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {transcriptHistory.map((entry) => (
                <div key={entry.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-500">{entry.timestamp}</span>
                    {entry.originalLang && (
                      <span className="text-xs text-purple-600 font-medium">{entry.originalLang}</span>
                    )}
                  </div>
                  {entry.originalText && (
                    <p className="text-slate-600 font-medium mb-1">{entry.originalText}</p>
                  )}
                  <div className="flex items-start gap-2 mt-2 pt-2 border-t border-dashed border-slate-300">
                    <span className="text-purple-500 mt-0.5 text-xs">➜</span>
                    <p className="text-purple-700 font-semibold text-sm">{entry.translatedText}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

