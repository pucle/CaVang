"use client";

import cognitiveAPI, { 
  ParticipantInfo, 
  AssessmentResult,
  useAssessment 
} from '../../../api/cognitiveAssessment';


import { useState, useEffect, useCallback, useRef } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Mic,
  Play,
  Square,
  ArrowRight,
  Volume2,
  Loader2,
  AlertTriangle,
  Timer,
  CheckCircle,
  Headphones,
  RotateCcw,
  Brain,
  MicOff,
  Save,
  SkipForward,
  Heart,
  Clock,
  User
} from "lucide-react";
import Papa from 'papaparse';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// Interfaces
interface Question {
  id: number;
  category: string;
  text: string;
  instruction?: string;
  image?: any;
  sampleText?: string;
}

interface UserData {
  name: string;
  age: string;
  gender: string;
  email: string;
  phone: string;
  title?: string;
  imageSrc?: string;
  mmseScore?: number;
}

interface TestResult {
  questionId: number;
  question: string;
  audioBlob?: Blob;
  audioFilename?: string;
  transcription?: string;
  timestamp: Date;
  duration: number;
  gpt_analysis?: any; // Thêm trường mới
  audio_features?: any; // Thêm trường mới
}

// Constants
const MAX_RECORDING_DURATION = 180;

// Thang điểm và trọng số
const LANGUAGE_WEIGHT = 0.6; // Ngôn ngữ (GPT)
const ACOUSTIC_WEIGHT = 0.4; // Âm học

// @ts-ignore
declare module 'papaparse' {
  export interface ParseResult<T = any> {
    data: T[];
    errors: ParseError[];
    meta: ParseMeta;
  }
}


// Main Component
export default function MemoryTestPage() {
  const router = useRouter();

  // Questions data
  const questions: Question[] = [
    { 
      id: 1, 
      category: "Thông tin cá nhân", 
      text: "Chào {greeting}! Hãy đánh vần đầy đủ họ và tên của mình nhé", 
      instruction: "Hãy nói từng chữ cái trong họ tên của bạn" 
    },
    { 
      id: 2, 
      category: "Tư duy ngôn ngữ", 
      text: "Chào {greeting}, hãy phân tích chi tiết bức ảnh dưới đây giúp Cá Vàng nha", 
      instruction: "Nhận diện các thành phần hiển thị (chữ, biểu tượng, cảnh, người, đối tượng…). \n Giải thích ý nghĩa của từng thành phần. \n Xác định mối liên hệ giữa các chi tiết. \n Đưa ra nhận định tổng quan: bức ảnh muốn truyền tải thông điệp hay thông tin gì?",
      image: "/cookie-theft.svg"
    },
    { 
      id: 3, 
      category: "Định hướng không gian", 
      text: "Chào {greeting}! hãy đọc đoạn này thật rõ giúp Cá Vàng nha", 
      instruction: "Đọc đoạn ngữ liệu thật to và rõ",
      sampleText: "Nói là kén ăn, không phải là thầy đòi hỏi cao lương mỹ vị, mà chỉ cần những thứ đơn giản thôi, nhưng phải biết ý mới chiều được. Bữa ăn không cần thịt cá, đôi khi chỉ cần đĩa bông bí chấm nước tôm kho đánh, nhưng nước tôm phải thật sánh, thật thơm, đỏ rực. Thịt bò thì nhất định phải nấu canh với hoa thiên lý, tô canh dìu dịu mùi hương ngọt ngào. Đêm khuya ngồi đọc sách, chỉ cần ăn củ khoai bồi dưỡng, nhưng khoai phải ngọt, dẻo, hấp với lá dứa. Chiều thì vài lóng mía tiện thật sạch sẽ, ửng màu đỏ cầm rượu."
    },
    { 
      id: 4, 
      category: "Định hướng thời gian", 
      text: "{greeting} có thể kể lại một kỷ niệm vui gần đây mà mình nhớ không?", 
      instruction: "Kể lại 1 kỉ niệm gần đây trong tối đa 3 phút" 
    },
    { 
      id: 5, 
      category: "Ghi nhớ", 
      text: "{greeting} hãy mô tả cách nấu một món ăn quen thuộc hoặc một công việc quen thuộc mà mình thường làm nhé", 
      instruction: "Hồi tưởng những bước thực hiện của công việc quen thuộc" 
    },
    { 
      id: 6, 
      category: "Tập trung và tính toán", 
      text: "Hãy tính 100 trừ 7 bằng bao nhiêu, rồi từ kết quả đó trừ cho 7 năm lần nữa, nhớ nói ra các bước tính nhé!", 
      instruction: "100 - 7 = ?, tiếp tục trừ 7 từ kết quả và đọc lên mỗi bước trừ. Ví dụ: 100 trừ 7 bằng 93, 93 trừ 7 bằng ..." 
    },
    { 
      id: 7, 
      category: "Tập trung", 
      text: "Hãy đọc ngược từng chữ cái trong từ 'TRÍ NHỚ'", 
      instruction: "Đọc ngược lại các chữ cái, ví dụ: PHÚC -> C U H P" 
    },
    { 
      id: 8, 
      category: "Nhanh nhạy", 
      text: "Trong vòng 1 phút, hãy kể tên càng nhiều loài động vật mà {greeting} nhớ được.", 
      instruction: "" 
    },
    { 
      id: 9, 
      category: "Nhanh nhạy", 
      text: "Tôi sẽ kể một câu chuyện ngắn: Bà Lan đi chợ mua 3 quả táo và 2 quả cam. Về nhà bà làm nước ép cho cháu uống. Hãy kể tiếp câu chuyện này", 
      instruction: "Kể lại câu chuyện với đầy đủ chi tiết" 
    },
    { 
      id: 10, 
      category: "Ngôn ngữ", 
      text: "Hãy nói tên 4 loại động vật bắt đầu bằng chữ 'C'", 
      instruction: "Nghĩ ra tên động vật bắt đầu với chữ C" 
    },
    { 
      id: 11, 
      category: "Ngôn ngữ", 
      text: "Hãy nói một câu có sử dụng từ 'bệnh viện', 'bác sĩ' và 'thuốc'", 
      instruction: "Tạo câu có đủ 3 từ đã cho" 
    },
    { 
      id: 12, 
      category: "Thực hiện công việc", 
      text: "Hãy mô tả cách pha một ly cà phê từ đầu đến cuối", 
      instruction: "Nói từng bước thực hiện" 
    }
  ];

  // State variables
  const [userData, setUserData] = useState<UserData | null>(null);
  const [greeting, setGreeting] = useState("");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [hasPlayedOnce, setHasPlayedOnce] = useState(false);
  const [isTTSSpeaking, setIsTTSSpeaking] = useState(false);

  // Refs
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentQuestionRef = useRef(currentQuestionIndex);
  
  // Derived state
  const currentQuestion = questions[currentQuestionIndex];
  const remainingTime = MAX_RECORDING_DURATION - recordingDuration;

  // Update ref when question changes
  useEffect(() => {
    currentQuestionRef.current = currentQuestionIndex;
    setHasPlayedOnce(false);
  }, [currentQuestionIndex]);

  // Functions
  const fetchUserData = async () => {
    try {
      const res = await fetch("/api/profile");
      if (res.ok) {
        const data = await res.json();
        setUserData(data);
        generateGreeting(data);
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    } finally {
      setIsLoading(false);
    }
  };

const generateGreeting = (data: UserData) => {
  const nameParts = data.name.trim().split(/\s+/); // tách theo khoảng trắng
  let firstName = '';

  // Lấy tên thật (thường là từ cuối cùng trong họ tên Việt Nam)
  // Ví dụ: "Nguyễn Văn Nam" -> firstName = "Nam"
  // "Trần Thị Lan" -> firstName = "Lan"  
  // "Lê Minh" -> firstName = "Minh"
  if (nameParts.length >= 1) {
    firstName = nameParts[nameParts.length - 1]; // Lấy từ cuối cùng làm tên
  }
    
    const age = parseInt(data.age);
    let honorific = '';
    
    // Special cases for specific names
    const specialNames = ['Phan Nguyễn Trà Ly', 'Nguyễn Phúc Nguyên', 'Nguyễn Tâm'];
    if (specialNames.includes(data.name)) {
      honorific = 'con lợn';
      setGreeting(`${honorific} ${firstName}`);
      return;
    }
    
    if (age >= 60) {
      honorific = data.gender === 'Nam' ? 'ông' : 'bà';
    } else if (age >= 30) {
      honorific = data.gender === 'Nam' ? 'anh' : 'chị';
    } else {
      honorific = 'bạn';
    }
    
    setGreeting(`${honorific} ${firstName}`);
  };

  const generateRecordingFilename = useCallback((questionIndex: number): string => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const userIdentifier = userData?.email?.split('@')[0] || userData?.phone || 'anonymous';
    const questionNumber = questionIndex + 1;
    return `${sessionId}_cau${questionNumber}_${userIdentifier}_${timestamp}.wav`;
  }, [sessionId, userData]);

  const speakCurrentQuestion = useCallback(async () => {
    if (!currentQuestion || !greeting || !('speechSynthesis' in window)) {
      console.log('TTS not available or data not ready');
      return;
    }

    const textToSpeak = currentQuestion.text.replace('{greeting}', greeting);
    
    try {
      window.speechSynthesis.cancel();
      await new Promise(resolve => setTimeout(resolve, 100));

      setIsTTSSpeaking(true);
      
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.rate = 0.7;
      utterance.pitch = 1;
      utterance.volume = 1;
      utterance.lang = 'vi-VN';

      const voices = window.speechSynthesis.getVoices();
      const vietnameseVoice = voices.find(voice => 
        voice.lang.includes('vi') || voice.name.toLowerCase().includes('vietnam')
      );

      if (vietnameseVoice) {
        utterance.voice = vietnameseVoice;
      }

      utterance.onend = () => {
        setIsTTSSpeaking(false);
      };

      utterance.onerror = () => {
        setIsTTSSpeaking(false);
      };

      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.error('Speech synthesis failed:', error);
      setIsTTSSpeaking(false);
    }
  }, [currentQuestion, greeting]);
  
  const handleTTSPlay = () => {
    speakCurrentQuestion();
  };

  const stopTTS = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsTTSSpeaking(false);
    }
  };

  const saveAudioFile = async (audioBlob: Blob, filename: string): Promise<boolean> => {
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, filename);
      formData.append('sessionId', sessionId);
      formData.append('questionId', currentQuestion.id.toString());
      
      const response = await fetch('/api/save-recording', {
        method: 'POST',
        body: formData
      });
      
      if (response.ok) {
        console.log('Audio file saved successfully:', filename);
        return true;
      } else {
        console.warn('Failed to save audio file:', response.status);
        return false;
      }
    } catch (error) {
      console.warn('Error saving audio file:', error);
      return false;
    }
  };

  // Thêm hàm mới để gửi audio + câu hỏi lên backend và nhận kết quả phân tích
  const analyzeAudio = async (audioBlob: Blob, filename: string) => {
    try {
      setIsProcessing(true);
      if (!audioBlob || audioBlob.size === 0) {
        throw new Error('Audio blob is empty or invalid');
      }
      if (!userData) throw new Error('Missing user data');
      const formData = new FormData();
      const audioFile = new File([audioBlob], filename || 'recording.wav', {
        type: audioBlob.type || 'audio/wav'
      });
      formData.append('audioFile', audioFile);
      formData.append('question', currentQuestion.text.replace('{greeting}', greeting));
      formData.append('age', userData.age);
      formData.append('gender', userData.gender);
      const response = await fetch('/api/analyze-audio', {
        method: 'POST',
        body: formData
      });
      let transcript = '';
      let gpt_analysis = null;
      let audio_features = null;
      if (response.ok) {
        const result = await response.json();
        transcript = result?.data?.transcript || '';
        gpt_analysis = result?.data?.gpt_analysis || null;
        audio_features = result?.data?.audio_features || null;
      } else {
        transcript = 'Không thể phân tích tự động.';
      }
      const result: TestResult = {
        questionId: currentQuestion.id,
        question: currentQuestion.text.replace('{greeting}', greeting),
        audioBlob,
        audioFilename: filename,
        transcription: transcript,
        timestamp: new Date(),
        duration: recordingDuration,
        // Lưu thêm các trường phân tích nếu muốn
        gpt_analysis,
        audio_features
      } as any;
      setTestResults(prev => {
        const filtered = prev.filter(r => r.questionId !== currentQuestion.id);
        return [...filtered, result];
      });
    } catch (error) {
      console.warn('Analyze audio error:', error);
      const result: TestResult = {
        questionId: currentQuestion.id,
        question: currentQuestion.text.replace('{greeting}', greeting),
        audioBlob,
        audioFilename: filename,
        transcription: 'Không thể phân tích tự động.',
        timestamp: new Date(),
        duration: recordingDuration
      };
      setTestResults(prev => {
        const filtered = prev.filter(r => r.questionId !== currentQuestion.id);
        return [...filtered, result];
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const audioBufferToWav = (buffer: AudioBuffer): ArrayBuffer => {
    const length = buffer.length;
    const numberOfChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const bytesPerSample = 2;
    
    const arrayBuffer = new ArrayBuffer(44 + length * numberOfChannels * bytesPerSample);
    const view = new DataView(arrayBuffer);
    
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    let pos = 0;
    
    writeString(pos, 'RIFF'); pos += 4;
    view.setUint32(pos, 36 + length * numberOfChannels * bytesPerSample, true); pos += 4;
    writeString(pos, 'WAVE'); pos += 4;
    
    writeString(pos, 'fmt '); pos += 4;
    view.setUint32(pos, 16, true); pos += 4;
    view.setUint16(pos, 1, true); pos += 2;
    view.setUint16(pos, numberOfChannels, true); pos += 2;
    view.setUint32(pos, sampleRate, true); pos += 4;
    view.setUint32(pos, sampleRate * numberOfChannels * bytesPerSample, true); pos += 4;
    view.setUint16(pos, numberOfChannels * bytesPerSample, true); pos += 2;
    view.setUint16(pos, 16, true); pos += 2;
    
    writeString(pos, 'data'); pos += 4;
    view.setUint32(pos, length * numberOfChannels * bytesPerSample, true); pos += 4;
    
    const channels = [];
    for (let channel = 0; channel < numberOfChannels; channel++) {
      channels.push(buffer.getChannelData(channel));
    }
    
    let offset = pos;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, channels[channel][i]));
        view.setInt16(offset, sample * 0x7FFF, true);
        offset += 2;
      }
    }
    
    return arrayBuffer;
  };

  const convertToWav = async (audioBlob: Blob): Promise<Blob> => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const wavArrayBuffer = audioBufferToWav(audioBuffer);
      return new Blob([wavArrayBuffer], { type: 'audio/wav' });
    } catch (error) {
      console.error('Error converting to WAV:', error);
      return audioBlob;
    }
  };

  const startRecording = async () => {
    try {
      stopTTS();
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
        }
      });
      
      const mimeTypes = [
        'audio/wav',
        'audio/webm;codecs=pcm',
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus'
      ];
      
      let selectedMimeType = 'audio/wav';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          console.log('Selected MIME type:', selectedMimeType);
          break;
        }
      }
      
      const recorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
        audioBitsPerSecond: 128000
      });
      
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };
      
      recorder.onstop = async () => {
        if (chunks.length === 0) {
          console.error('No audio data recorded');
          alert('Không có dữ liệu âm thanh được ghi lại. Vui lòng thử lại.');
          return;
        }
        
        let audioBlob = new Blob(chunks, { 
          type: selectedMimeType
        });
        
        if (!selectedMimeType.includes('wav')) {
          console.log('Converting to WAV format...');
          audioBlob = await convertToWav(audioBlob);
        }
        
        if (audioBlob.size < 1000) {
          console.error('Audio blob too small:', audioBlob.size);
          alert('File âm thanh quá nhỏ. Vui lòng ghi âm lại.');
          return;
        }
        
        const filename = generateRecordingFilename(currentQuestionIndex);
        
        setAudioChunks(chunks);
        setHasRecording(true);
        
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        
        const [fileSaved] = await Promise.all([
          saveAudioFile(audioBlob, filename),
          analyzeAudio(audioBlob, filename)
        ]);
        
        if (!fileSaved) {
          console.warn('Audio file was not saved to server');
        }
        
        stream.getTracks().forEach(track => track.stop());
        
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
      };

      recorder.onerror = (e) => {
        console.error('MediaRecorder error:', e);
        alert('Lỗi trong quá trình ghi âm. Vui lòng thử lại.');
        stream.getTracks().forEach(track => track.stop());
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        setIsRecording(false);
      };

      setMediaRecorder(recorder);
      recorder.start(250);
      setIsRecording(true);
      setHasRecording(false);
      setRecordingDuration(0);
      
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          const newDuration = prev + 1;
          if (newDuration >= MAX_RECORDING_DURATION) {
            setTimeout(() => stopRecording(), 100);
          }
          return newDuration;
        });
      }, 1000);
      
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Không thể truy cập microphone. Vui lòng kiểm tra quyền truy cập và thử lại.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      try {
        mediaRecorder.stop();
        setIsRecording(false);
      } catch (error) {
        console.error('Error stopping recording:', error);
        setIsRecording(false);
      }
    }
  };

  const resetRecording = () => {
    setHasRecording(false);
    setRecordingDuration(0);
    setAudioChunks([]);
    setIsProcessing(false);
    
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    
    setTestResults(prev => prev.filter(result => result.questionId !== currentQuestion.id));
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const nextQuestion = () => {
    stopTTS();
    
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setHasRecording(false);
      setRecordingDuration(0);
      setIsProcessing(false);
      
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }
    } else {
      finishTest();
    }
  };

  const skipQuestion = () => {
    if (confirm('Bạn có chắc chắn muốn bỏ qua câu hỏi này không?')) {
      nextQuestion();
    }
  };

  const finishTest = async () => {
    try {
      const formData = new FormData();
      formData.append('userId', (userData?.email || userData?.phone || 'anonymous'));
      formData.append('sessionId', sessionId);
      formData.append('results', JSON.stringify(testResults.map(result => ({
        questionId: result.questionId,
        question: result.question,
        transcription: result.transcription,
        timestamp: result.timestamp
      }))));
      formData.append('completedAt', new Date().toISOString());
      formData.append('userInfo', JSON.stringify({
        name: userData?.name,
        age: userData?.age,
        email: userData?.email,
        phone: userData?.phone
      }));
      // Gửi kèm audio files theo index
      testResults.forEach((result, index) => {
        if (result.audioBlob) {
          const file = new File([result.audioBlob], result.audioFilename || `q${result.questionId}.wav`, {
            type: result.audioBlob.type || 'audio/wav'
          });
          formData.append(`audioFile_${index}`, file);
        }
      });

      const response = await fetch('/api/memory-test-result', {
        method: 'POST',
        body: formData,
      });
      
      if (response.ok) {
        router.push('/learn/results');
      } else {
        throw new Error(`Failed to save results: ${response.status}`);
      }
      
    } catch (error) {
      console.error('Error saving test results:', error);
      alert('Có lỗi khi lưu kết quả. Kết quả vẫn được lưu tạm thời.');
      router.push('/learn/results');
    }
  };

  useEffect(() => {
    if (greeting && currentQuestion && !hasPlayedOnce && !isLoading) {
      const timer = setTimeout(() => {
        speakCurrentQuestion();
        setHasPlayedOnce(true);
      }, 1500);
      
      return () => clearTimeout(timer);
    }
  }, [currentQuestionIndex, greeting, isLoading, hasPlayedOnce, speakCurrentQuestion]);

  useEffect(() => {
    fetchUserData();
    
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      stopTTS();
    };
  }, []);

  useEffect(() => {
    if ('speechSynthesis' in window) {
      const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        console.log('Available voices:', voices.length);
      };
      
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-3 sm:p-4 md:p-6 relative overflow-hidden">
        <div className="absolute inset-0">
          <motion.div
            className="absolute top-1/4 left-1/4 w-0.5 h-0.5 sm:w-1 sm:h-1 bg-blue-400 rounded-full"
            animate={{
              scale: [1, 6, 1],
              opacity: [0.3, 0.8, 0.3],
            }}
            transition={{ duration: 4, repeat: Infinity, delay: 0 }}
          />
          <motion.div
            className="absolute top-1/3 right-1/3 w-0.5 h-0.5 sm:w-1 sm:h-1 bg-purple-400 rounded-full"
            animate={{
              scale: [1, 4, 1],
              opacity: [0.3, 0.6, 0.3],
            }}
            transition={{ duration: 3, repeat: Infinity, delay: 1 }}
          />
          <motion.div
            className="absolute bottom-1/3 left-1/3 w-0.5 h-0.5 sm:w-1 sm:h-1 bg-pink-400 rounded-full"
            animate={{
              scale: [1, 8, 1],
              opacity: [0.2, 0.7, 0.2],
            }}
            transition={{ duration: 5, repeat: Infinity, delay: 2 }}
          />
        </div>

        <div className="text-center max-w-xs sm:max-w-sm md:max-w-md w-full relative z-10 px-4">
          <motion.div
            className="mb-6 sm:mb-8 md:mb-12 relative"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <motion.div
              animate={{ 
                rotate: [0, 5, -5, 0],
                scale: [1, 1.05, 1]
              }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <Brain className="h-12 w-12 sm:h-16 sm:w-16 md:h-20 md:w-20 mx-auto text-gray-800" />
            </motion.div>
            <motion.div
              className="absolute -inset-1 sm:-inset-2 border border-gray-200 rounded-full opacity-30"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="mb-6 sm:mb-8"
          >
            <h1 className="text-xl sm:text-2xl md:text-3xl font-light text-gray-900 mb-2">
              {/* Fix: Only show greeting when both userData and greeting are available */}
              Chào mừng {userData && greeting ? greeting : 'bạn'}
            </h1>
            <p className="text-sm sm:text-base md:text-lg text-gray-600 font-light">
              Kiểm tra trí nhớ và nhận thức
            </p>
          </motion.div>

          {userData && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="mb-6 sm:mb-8 space-y-2 sm:space-y-3"
            >
              <div className="flex items-center justify-center gap-2 sm:gap-3 text-gray-700">
                <User className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="font-light text-sm sm:text-base">{userData.name}</span>
              </div>
              <div className="flex items-center justify-center gap-4 sm:gap-8 text-xs sm:text-sm text-gray-500">
                <span>{userData.age} tuổi</span>
                <span>{userData.gender}</span>
              </div>
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ duration: 1, delay: 0.9 }}
            className="w-24 sm:w-32 md:w-40 h-0.5 bg-gray-200 mx-auto mb-4 sm:mb-6 overflow-hidden"
          >
            <motion.div
              className="h-full bg-gray-800"
              animate={{ 
                x: ["-100%", "100%", "-100%"]
              }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.2 }}
          >
            <p className="text-xs sm:text-sm text-gray-400 font-light">
              Đang chuẩn bị bài kiểm tra...
            </p>
          </motion.div>
        </div>
      </div>
    );
  }
  
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 relative overflow-hidden">
      <div className="absolute inset-0">
        <motion.div
          className="absolute top-20 left-10 w-24 h-24 bg-purple-200/30 rounded-full blur-xl"
          animate={{
            x: [0, 30, 0],
            y: [0, -20, 0],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-20 right-10 w-32 h-32 bg-pink-200/30 rounded-full blur-xl"
          animate={{
            x: [0, -20, 0],
            y: [0, 30, 0],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="relative z-10 p-3 sm:p-4 md:p-6 lg:p-8">
        <div className="mb-4 sm:mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
            <div className="bg-white/90 backdrop-blur-lg rounded-lg sm:rounded-xl px-3 sm:px-4 py-1.5 sm:py-2 shadow-lg border border-white/20">
              <span className="text-base sm:text-lg font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                Câu {currentQuestionIndex + 1}/{questions.length}
              </span>
            </div>
            <div className="flex-1 bg-white/50 rounded-full h-2 sm:h-3 overflow-hidden shadow-inner">
              <motion.div
                className="h-full bg-gradient-to-r from-green-400 via-blue-500 to-purple-600"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
            <div className="text-xs sm:text-sm text-gray-600 font-medium">
              Hoàn thành {Math.round(progress)}%
            </div>
          </div>
        </div>

        <motion.div
          key={currentQuestionIndex}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 max-w-7xl mx-auto"
        >
          <div className="lg:col-span-7">
            <Card className="bg-white/95 backdrop-blur-xl shadow-xl rounded-xl sm:rounded-2xl border border-white/30 h-full">
              <div className="bg-gradient-to-r from-purple-500 to-pink-500 px-4 sm:px-6 py-3 sm:py-4 rounded-t-xl sm:rounded-t-2xl">
                <div className="text-center">
                  <div className="inline-flex items-center gap-1.5 sm:gap-2 bg-white/20 backdrop-blur-sm rounded-lg sm:rounded-xl px-3 sm:px-4 py-1.5 sm:py-2">
                    <Heart className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                    <span className="text-white font-semibold text-sm sm:text-base">
                      {currentQuestion.category}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
                  <Button
                    onClick={handleTTSPlay}
                    disabled={isTTSSpeaking}
                    className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-lg sm:rounded-xl px-4 sm:px-6 py-2 sm:py-3 shadow-md transform hover:scale-105 transition-all duration-200 text-sm sm:text-base"
                  >
                    {isTTSSpeaking ? (
                      <>
                        <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2 animate-pulse" />
                        Đang đọc...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" />
                        Đọc câu hỏi
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={stopTTS}
                    variant="primaryOutline"
                    className="bg-white/70 hover:bg-white/90 backdrop-blur-sm border-gray-200 rounded-lg sm:rounded-xl px-4 sm:px-6 py-2 sm:py-3 shadow-md transform hover:scale-105 transition-all duration-200 text-sm sm:text-base"
                  >
                    <Square className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" />
                    Dừng
                  </Button>
                </div>

                <div className="text-center space-y-3 sm:space-y-4">
                  <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-gray-800 leading-relaxed px-2">
                    {currentQuestion.text.replace('{greeting}', greeting)}
                  </h1>
                  {/* Hiển thị ảnh nếu có */}
                  {currentQuestion.image && (
                    <div className="flex justify-center my-4">
                      <Image
                        src={currentQuestion.image}
                        alt="Hình minh họa"
                        width={400}
                        height={250}
                        className="rounded-xl shadow-md max-w-full h-auto"
                      />
                    </div>
                  )}
                  {/* Hiển thị đoạn ngữ liệu nếu có */}
                  {currentQuestion.sampleText && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mt-2 text-left text-sm sm:text-base text-gray-700 whitespace-pre-line">
                      <strong>Đoạn ngữ liệu:</strong>
                      <div>{currentQuestion.sampleText}</div>
                    </div>
                  )}
                </div>
              

                <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-l-4 border-orange-400 rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-inner">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600 flex-shrink-0 mt-0.5" />
                    <div className="text-left">
                      <h3 className="text-base sm:text-lg font-bold text-orange-800 mb-1">Hướng dẫn:</h3>
                      <p className="text-sm sm:text-base text-orange-700 leading-relaxed">
                        {currentQuestion.instruction}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          <div className="lg:col-span-5">
            <Card className="bg-white/95 backdrop-blur-xl shadow-xl rounded-xl sm:rounded-2xl border border-white/30 h-full">
              <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 flex flex-col h-full">
                <div className="flex-1 flex flex-col items-center justify-center space-y-4 sm:space-y-6">
                  {isRecording ? (
                    <motion.div
                      className="relative"
                      initial={{ scale: 0.9 }}
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      <div className="absolute inset-0 bg-red-500/20 rounded-full blur-2xl animate-pulse" />
                      <Button
                        onClick={stopRecording}
                        className="relative z-10 w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-full bg-gradient-to-br from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white shadow-xl flex flex-col items-center justify-center transition-all duration-300 border-2 sm:border-4 border-white/50"
                      >
                        <MicOff className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 mb-1 sm:mb-2" />
                        <span className="text-xs sm:text-sm font-bold">DỪNG</span>
                      </Button>
                    </motion.div>
                  ) : (
                    <Button
                      onClick={startRecording}
                      disabled={isProcessing}
                      className="w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-500 text-white shadow-xl flex flex-col items-center justify-center transition-all duration-300 border-2 sm:border-4 border-white/50 transform hover:scale-105 disabled:transform-none disabled:cursor-not-allowed"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 animate-spin mb-1 sm:mb-2" />
                          <span className="text-xs sm:text-sm font-bold">Xử lý...</span>
                        </>
                      ) : (
                        <>
                          <Mic className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 mb-1 sm:mb-2" />
                          <span className="text-xs sm:text-sm font-bold">GHI ÂM</span>
                        </>
                      )}
                    </Button>
                  )}

                  <div className="text-center min-h-[80px] sm:min-h-[90px] flex flex-col items-center justify-center px-2">
                    {isProcessing ? (
                      <div className="bg-blue-100 rounded-lg sm:rounded-xl px-4 sm:px-6 py-2 sm:py-3">
                        <div className="flex items-center gap-2 sm:gap-3 text-base sm:text-lg font-bold text-blue-700">
                          <Loader2 className="w-4 h-4 sm:w-6 sm:h-6 animate-spin" />
                          Đang xử lý...
                        </div>
                      </div>
                    ) : isRecording ? (
                      <div className="bg-red-100 rounded-lg sm:rounded-xl px-4 sm:px-6 py-3 sm:py-4 space-y-1.5 sm:space-y-2">
                        <div className="flex items-center justify-center gap-1.5 sm:gap-2 text-base sm:text-lg font-bold text-red-700">
                          <Timer className="w-4 h-4 sm:w-6 sm:h-6 animate-pulse" />
                          ĐANG GHI ÂM
                        </div>
                        <div className="text-xl sm:text-2xl font-bold text-red-600 bg-white/70 px-3 sm:px-4 py-1 rounded-lg">
                          {formatDuration(recordingDuration)}
                        </div>
                        {remainingTime <= 30 && remainingTime > 0 && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex items-center justify-center gap-1.5 sm:gap-2 text-orange-600 bg-orange-50 px-2 sm:px-3 py-1 rounded-lg"
                          >
                            <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                            <span className="text-xs sm:text-sm font-semibold">
                              Còn lại {remainingTime}s
                            </span>
                          </motion.div>
                        )}
                        {remainingTime <= 10 && remainingTime > 0 && (
                          <motion.div
                            animate={{ scale: [1, 1.1, 1] }}
                            transition={{ duration: 0.5, repeat: Infinity }}
                            className="text-red-600 text-xs font-bold bg-red-50 px-2 py-1 rounded"
                          >
                            Sắp hết thời gian!
                          </motion.div>
                        )}
                      </div>
                    ) : hasRecording ? (
                      <div className="bg-green-100 rounded-lg sm:rounded-xl px-4 sm:px-6 py-2 sm:py-3">
                        <div className="flex items-center gap-1.5 sm:gap-2 text-base sm:text-lg font-bold text-green-700">
                          <CheckCircle className="w-4 h-4 sm:w-6 sm:h-6" />
                          Đã ghi âm
                        </div>
                        <p className="text-xs sm:text-sm text-green-600 mt-1">
                          {formatDuration(recordingDuration)}
                        </p>
                      </div>
                    ) : (
                      <div className="bg-gray-100 rounded-lg sm:rounded-xl px-4 sm:px-6 py-2 sm:py-3">
                        <p className="text-base sm:text-lg font-medium text-gray-700 mb-1 sm:mb-2">
                          Nhấn để bắt đầu ghi âm
                        </p>
                        <div className="flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-500">
                          <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                          <span>Tối đa 3 phút</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {hasRecording && (
                  <div className="flex flex-wrap justify-center gap-2 pt-3 sm:pt-4 border-t border-gray-200">
                    <Button
                      onClick={() => {
                        const existingResult = testResults.find(r => r.questionId === currentQuestion.id);
                        if (existingResult && existingResult.audioBlob) {
                          const url = URL.createObjectURL(existingResult.audioBlob);
                          const audio = new Audio(url);
                          audio.play().catch(console.error);
                        }
                      }}
                      className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-lg px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm"
                    >
                      <Headphones className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                      Nghe lại
                    </Button>
                    <Button
                      onClick={resetRecording}
                      className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-lg px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm"
                    >
                      <RotateCcw className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                      Ghi lại
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </motion.div>

        <div className="mt-4 sm:mt-6 max-w-7xl mx-auto">
          <Card className="bg-white/95 backdrop-blur-xl shadow-xl rounded-xl sm:rounded-2xl border border-white/30">
            <div className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-4">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 sm:gap-4 text-xs sm:text-sm text-gray-600">
                  <div className="flex items-center gap-1 sm:gap-1.5">
                    <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-green-500" />
                    <span>Hoàn thành: {testResults.length}</span>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-1.5">
                    <Timer className="w-3 h-3 sm:w-4 sm:h-4 text-blue-500" />
                    <span>Còn lại: {questions.length - currentQuestionIndex - 1}</span>
                  </div>
                </div>

                <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
                  <Button
                    onClick={skipQuestion}
                    variant="primaryOutline"
                    disabled={isProcessing || isRecording}
                    className="bg-yellow-50 hover:bg-yellow-100 border-yellow-300 text-yellow-700 hover:text-yellow-800 rounded-lg sm:rounded-xl px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm"
                  >
                    <SkipForward className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                    Bỏ qua
                  </Button>
                  
                  {currentQuestionIndex < questions.length - 1 ? (
                    <Button
                      onClick={nextQuestion}
                      disabled={!hasRecording || isProcessing || isRecording}
                      className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-lg sm:rounded-xl px-4 sm:px-6 py-1.5 sm:py-2 font-semibold text-xs sm:text-sm"
                    >
                      <span className="hidden sm:inline">Câu tiếp theo (Câu {currentQuestionIndex + 2}/{questions.length})</span>
                      <span className="sm:hidden">Tiếp ({currentQuestionIndex + 2}/{questions.length})</span>
                      <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 ml-1" />
                    </Button>
                  ) : (
                    <Button
                      onClick={finishTest}
                      disabled={!hasRecording || isProcessing || isRecording}
                      className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-lg sm:rounded-xl px-6 sm:px-8 py-1.5 sm:py-2 font-semibold text-xs sm:text-sm"
                    >
                      <Save className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                      Hoàn thành
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
      {/* Hiển thị chi tiết kết quả từng câu */}
      {testResults.length > 0 && (
        <div className="max-w-4xl mx-auto mt-8">
          <h2 className="text-lg font-bold mb-2">Kết quả từng câu</h2>
          <div className="space-y-4">
            {testResults.sort((a, b) => a.questionId - b.questionId).map((result, idx) => (
              <div key={result.questionId} className="bg-white rounded-lg shadow p-4 border border-gray-200">
                <div className="font-semibold mb-1">Câu {idx + 1}: {result.question}</div>
                <div className="text-sm text-gray-700 mb-1"><b>Transcript:</b> {result.transcription}</div>
                {result.gpt_analysis && (
                  <div className="text-sm text-gray-700 mb-1">
                    <b>GPT đánh giá:</b>
                    <ul className="ml-4 list-disc">
                      <li>Lặp từ: {typeof result.gpt_analysis.repetition_rate === 'number' ? (result.gpt_analysis.repetition_rate * 100).toFixed(1) + '%' : result.gpt_analysis.repetition_rate}</li>
                      <li>Phong phú ngôn ngữ: {result.gpt_analysis.vocabulary_score}/10</li>
                      <li>Hợp ngữ cảnh: {result.gpt_analysis.context_relevance}/10</li>
                      <li>Phân tích: {result.gpt_analysis.analysis}</li>
                    </ul>
                  </div>
                )}
                {result.audio_features && (
                  <div className="text-sm text-gray-700 mb-1">
                    <b>Âm học:</b>
                    <ul className="ml-4 list-disc">
                      <li>Tốc độ nói: {result.audio_features.speech_rate ? result.audio_features.speech_rate.toFixed(1) : 'N/A'} từ/phút</li>
                      <li>Số phát ngôn: {result.audio_features.number_utt ?? 'N/A'}</li>
                      <li>Khoảng nghỉ TB: {result.audio_features.sildur_mean ? result.audio_features.sildur_mean.toFixed(2) : 'N/A'}s</li>
                      <li>Cao độ TB: {result.audio_features.pitch_mean ? result.audio_features.pitch_mean.toFixed(0) : 'N/A'} Hz</li>
                      <li>Năng lượng TB: {result.audio_features.energy_mean ? Number(result.audio_features.energy_mean).toFixed(3) : 'N/A'}</li>
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hiển thị tổng hợp điểm và xuất file sau khi hoàn thành tất cả câu hỏi */}
      {testResults.length === questions.length && (
        <div className="max-w-4xl mx-auto mt-8">
          <h2 className="text-lg font-bold mb-2">Tổng hợp kết quả</h2>
          <div className="text-sm text-gray-600 mb-2">Thang điểm: 0 - 100 (Ngôn ngữ {Math.round(LANGUAGE_WEIGHT*100)}%, Âm học {Math.round(ACOUSTIC_WEIGHT*100)}%)</div>
          <ScoreSummary results={testResults} />
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              onClick={() => {
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(testResults, null, 2));
                const dlAnchorElem = document.createElement('a');
                dlAnchorElem.setAttribute("href", dataStr);
                dlAnchorElem.setAttribute("download", `memory_test_results_${Date.now()}.json`);
                dlAnchorElem.click();
              }}
            >
              Xuất file kết quả (.json)
            </button>
            <button
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              onClick={() => {
                // Xuất CSV bằng papaparse
                const csv = Papa.unparse(testResults.map((r, idx) => ({
                  STT: idx + 1,
                  Câu: r.question,
                  Transcript: r.transcription,
                  'Lặp từ (%)': r.gpt_analysis ? (typeof r.gpt_analysis.repetition_rate === 'number' ? (r.gpt_analysis.repetition_rate * 100).toFixed(1) : r.gpt_analysis.repetition_rate) : '',
                  'Phong phú ngôn ngữ': r.gpt_analysis?.vocabulary_score,
                  'Hợp ngữ cảnh': r.gpt_analysis?.context_relevance,
                  'Điểm âm học': r.audio_features?.speech_rate,
                  'Phân tích GPT': r.gpt_analysis?.analysis
                })));
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', `memory_test_results_${Date.now()}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
            >
              Xuất file CSV
            </button>
            <button
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              onClick={() => {
                // Xuất PDF bằng jsPDF
                const doc = new jsPDF();
                doc.text('Kết quả Memory Test', 14, 16);
                const tableData = testResults.map((r, idx) => [
                  idx + 1,
                  r.question,
                  r.transcription,
                  r.gpt_analysis ? (typeof r.gpt_analysis.repetition_rate === 'number' ? (r.gpt_analysis.repetition_rate * 100).toFixed(1) : r.gpt_analysis.repetition_rate) : '',
                  r.gpt_analysis?.vocabulary_score,
                  r.gpt_analysis?.context_relevance,
                  r.audio_features?.speech_rate,
                  r.gpt_analysis?.analysis
                ]);
                (doc as any).autoTable({
                  head: [[
                    'STT', 'Câu', 'Transcript', 'Lặp từ (%)', 'Phong phú ngôn ngữ', 'Hợp ngữ cảnh', 'Điểm âm học', 'Phân tích GPT'
                  ]],
                  body: tableData,
                  startY: 22,
                  styles: { fontSize: 8, cellWidth: 'wrap' },
                  headStyles: { fillColor: [41, 128, 185] }
                });
                doc.save(`memory_test_results_${Date.now()}.pdf`);
              }}
            >
              Xuất file PDF
            </button>
          </div>
          <div className="mt-8">
            <h3 className="font-semibold mb-2">Biểu đồ điểm số từng câu</h3>
            <ScoreChart results={testResults} />
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreSummary({ results }: { results: TestResult[] }) {
  // Tính điểm trung bình các trường GPT và âm học (thang 0-10)
  let totalContext = 0, totalVocab = 0, totalRep = 0, totalAudio = 0, countAudio = 0, count = 0;
  results.forEach(r => {
    if (r.gpt_analysis) {
      totalContext += Number(r.gpt_analysis.context_relevance) || 0;
      totalVocab += Number(r.gpt_analysis.vocabulary_score) || 0;
      // Lặp từ: điểm = 10 - repetition_rate*10 nếu là 0-1, hoặc 10 - repetition_rate nếu là %
      let rep = Number(r.gpt_analysis.repetition_rate);
      if (rep > 1) rep = rep / 100; // nếu là %
      totalRep += 10 - (rep * 10);
      count++;
    }
    if (r.audio_features && typeof r.audio_features.speech_rate === 'number') {
      // Điểm âm học theo speech_rate
      let audioScore = 10;
      const rate = r.audio_features.speech_rate;
      if (rate < 80) audioScore -= (80 - rate) / 10;
      if (rate > 140) audioScore -= (rate - 140) / 10;
      if (audioScore < 0) audioScore = 0;
      totalAudio += audioScore;
      countAudio++;
    }
  });
  const avgContext10 = count > 0 ? totalContext / count : 0;
  const avgVocab10 = count > 0 ? totalVocab / count : 0;
  const avgRep10 = count > 0 ? totalRep / count : 0;
  const avgAudio10 = countAudio > 0 ? totalAudio / countAudio : 0;

  // Ngôn ngữ trung bình (0-10)
  const avgLanguage10 = (avgContext10 + avgVocab10 + avgRep10) / 3;

  // Điểm tổng hợp (0-10) theo trọng số
  let finalScore10 = 0;
  if (count > 0 && countAudio > 0) {
    finalScore10 = avgLanguage10 * LANGUAGE_WEIGHT + avgAudio10 * ACOUSTIC_WEIGHT;
  } else if (count > 0) {
    finalScore10 = avgLanguage10;
  } else if (countAudio > 0) {
    finalScore10 = avgAudio10;
  }

  // Quy đổi 0-100
  const avgContext = avgContext10.toFixed(2);
  const avgVocab = avgVocab10.toFixed(2);
  const avgRep = avgRep10.toFixed(2);
  const avgAudio = countAudio > 0 ? avgAudio10.toFixed(2) : 'N/A';
  const finalScore100Num = Math.max(0, Math.min(100, finalScore10 * 10));
  const finalScore100 = finalScore100Num.toFixed(1);

  // Phân loại rủi ro
  const riskLevel = finalScore100Num >= 80
    ? 'Thấp (Bình thường)'
    : finalScore100Num >= 60
      ? 'Trung bình (Cần theo dõi)'
      : finalScore100Num >= 40
        ? 'Cao (Cần can thiệp)'
        : 'Rất cao (Cần đánh giá chuyên sâu)';

  return (
    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200 mt-2">
      <div className="font-semibold mb-2">Điểm trung bình (0-10):</div>
      <ul className="ml-4 list-disc text-sm text-blue-900">
        <li>Hợp ngữ cảnh (GPT): {avgContext}/10</li>
        <li>Phong phú ngôn ngữ (GPT): {avgVocab}/10</li>
        <li>Lặp từ (GPT, càng cao càng tốt): {avgRep}/10</li>
        <li>Âm học (speech rate): {avgAudio}/10</li>
      </ul>
      <div className="mt-3 font-semibold text-blue-900">Điểm tổng hợp cuối cùng: {finalScore100}/100 — Mức rủi ro: {riskLevel}</div>
    </div>
  );
}

function ScoreChart({ results }: { results: TestResult[] }) {
  const labels = results.map((r, idx) => `Câu ${idx + 1}`);
  const context = results.map(r => Number(r.gpt_analysis?.context_relevance) || 0);
  const vocab = results.map(r => Number(r.gpt_analysis?.vocabulary_score) || 0);
  const rep = results.map(r => {
    let val = Number(r.gpt_analysis?.repetition_rate);
    if (val > 1) val = val / 100;
    return 10 - (val * 10);
  });
  const audio = results.map(r => {
    if (r.audio_features && typeof r.audio_features.speech_rate === 'number') {
      let audioScore = 10;
      const rate = r.audio_features.speech_rate;
      if (rate < 80) audioScore -= (80 - rate) / 10;
      if (rate > 140) audioScore -= (rate - 140) / 10;
      if (audioScore < 0) audioScore = 0;
      return audioScore;
    }
    return 0;
  });
  const language = labels.map((_, i) => (context[i] + vocab[i] + rep[i]) / 3);
  const final10 = labels.map((_, i) => (language[i] * LANGUAGE_WEIGHT + audio[i] * ACOUSTIC_WEIGHT));
  const final100 = final10.map(v => Math.max(0, Math.min(100, v * 10)));
  const data = {
    labels,
    datasets: [
      {
        label: 'Hợp ngữ cảnh (GPT) [0-10]',
        data: context,
        backgroundColor: 'rgba(54, 162, 235, 0.6)'
      },
      {
        label: 'Phong phú ngôn ngữ (GPT) [0-10]',
        data: vocab,
        backgroundColor: 'rgba(255, 206, 86, 0.6)'
      },
      {
        label: 'Điểm lặp từ (GPT) [0-10]',
        data: rep,
        backgroundColor: 'rgba(255, 99, 132, 0.6)'
      },
      {
        label: 'Âm học [0-10]',
        data: audio,
        backgroundColor: 'rgba(75, 192, 192, 0.6)'
      },
      {
        label: 'Tổng hợp [0-100]',
        data: final100,
        backgroundColor: 'rgba(153, 102, 255, 0.6)'
      }
    ]
  };
  const options = {
    responsive: true,
    plugins: {
      legend: { position: 'top' as const },
      title: { display: true, text: 'Biểu đồ điểm số từng câu' }
    },
    scales: {
      y: { min: 0, max: 100, title: { display: true, text: 'Điểm' } }
    }
  };
  return <Bar data={data} options={options} />;
}