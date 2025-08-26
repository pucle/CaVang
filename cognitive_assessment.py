from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import tempfile
import json
from datetime import datetime
import pandas as pd
import numpy as np
import librosa
from pydub import AudioSegment
import scipy.stats as stats
from scipy.signal import find_peaks
import warnings
from typing import Dict, List, Tuple, Any
import joblib
import traceback
from openai import OpenAI

warnings.filterwarnings('ignore')

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size

# ========================== AUDIO FEATURE EXTRACTOR ==========================
class AudioFeatureExtractor:
    """Trích xuất đặc trưng âm thanh cho đánh giá nhận thức"""
    
    def __init__(self, sample_rate=22050):
        self.sr = sample_rate
        
    def load_audio(self, file_path: str) -> Tuple[np.ndarray, int]:
        """Load file âm thanh"""
        try:
            audio, sr = librosa.load(file_path, sr=self.sr)
            return audio, sr
        except Exception as e:
            print(f"Librosa load failed: {e}, trying pydub...")
            try:
                audio_segment = AudioSegment.from_file(file_path)
                audio_segment = audio_segment.set_frame_rate(self.sr).set_channels(1)
                audio = np.array(audio_segment.get_array_of_samples(), dtype=np.float32)
                if np.max(np.abs(audio)) > 0:
                    audio = audio / np.max(np.abs(audio))  # Normalize
                return audio, self.sr
            except Exception as e2:
                raise Exception(f"Cannot load audio file: {e2}")
    
    def extract_basic_features(self, audio: np.ndarray, sr: int) -> Dict[str, float]:
        """Trích xuất các đặc trưng cơ bản"""
        features = {}
        
        # Duration
        duration = len(audio) / sr
        features['duration_total'] = duration
        
        # Energy features with error handling
        try:
            energy = librosa.feature.rms(y=audio, frame_length=2048, hop_length=512)[0]
            features['energy_mean'] = float(np.mean(energy))
            features['energy_std'] = float(np.std(energy))
            features['energy_max'] = float(np.max(energy))
            features['energy_min'] = float(np.min(energy))
        except Exception as e:
            print(f"Energy extraction error: {e}")
            features.update({'energy_mean': 0, 'energy_std': 0, 'energy_max': 0, 'energy_min': 0})
        
        # Zero crossing rate
        try:
            zcr = librosa.feature.zero_crossing_rate(audio)[0]
            features['zcr_mean'] = float(np.mean(zcr))
            features['zcr_std'] = float(np.std(zcr))
        except Exception as e:
            print(f"ZCR extraction error: {e}")
            features.update({'zcr_mean': 0, 'zcr_std': 0})
        
        return features
    
    def extract_pitch_features(self, audio: np.ndarray, sr: int) -> Dict[str, float]:
        """Trích xuất đặc trưng cao độ (pitch)"""
        features = {}
        try:
            pitches, magnitudes = librosa.piptrack(y=audio, sr=sr, threshold=0.05, 
                                                  fmin=50, fmax=400)
            
            pitch_values = []
            for t in range(min(pitches.shape[1], 1000)):
                if magnitudes[:, t].max() > 0:
                    index = magnitudes[:, t].argmax()
                    pitch = pitches[index, t]
                    if 50 < pitch < 400:
                        pitch_values.append(pitch)
            
            if len(pitch_values) > 5:
                features['pitch_mean'] = float(np.mean(pitch_values))
                features['pitch_std'] = float(np.std(pitch_values))
                features['pitch_max'] = float(np.max(pitch_values))
                features['pitch_min'] = float(np.min(pitch_values))
                features['pitch_range'] = features['pitch_max'] - features['pitch_min']
            else:
                features.update({
                    'pitch_mean': 150, 'pitch_std': 0, 'pitch_max': 150, 
                    'pitch_min': 150, 'pitch_range': 0
                })
        except Exception as e:
            print(f"Pitch extraction error: {e}")
            features.update({
                'pitch_mean': 150, 'pitch_std': 0, 'pitch_max': 150, 
                'pitch_min': 150, 'pitch_range': 0
            })
        
        return features
    
    def extract_mfcc_features(self, audio: np.ndarray, sr: int, n_mfcc: int = 13) -> Dict[str, float]:
        """Trích xuất MFCC features"""
        features = {}
        try:
            mfcc = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=n_mfcc)
            
            for i in range(n_mfcc):
                features[f'mfcc_{i+1}_mean'] = float(np.mean(mfcc[i]))
                features[f'mfcc_{i+1}_std'] = float(np.std(mfcc[i]))
        except Exception as e:
            print(f"MFCC extraction error: {e}")
            for i in range(n_mfcc):
                features[f'mfcc_{i+1}_mean'] = 0.0
                features[f'mfcc_{i+1}_std'] = 0.0
        
        return features
    
    def detect_pauses_and_speech(self, audio: np.ndarray, sr: int) -> Dict[str, float]:
        """Phát hiện khoảng nghỉ và phân đoạn speech"""
        features = {}
        
        try:
            frame_length = 2048
            hop_length = 512
            
            energy = librosa.feature.rms(y=audio, frame_length=frame_length, hop_length=hop_length)[0]
            
            if len(energy) == 0:
                features.update({
                    'dur_mean': 0, 'dur_std': 0, 'dur_median': 0,
                    'dur_max': 0, 'dur_min': 0, 'number_utt': 0,
                    'sildur_mean': 0, 'sildur_std': 0, 'sildur_median': 0,
                    'sildur_max': 0, 'sildur_min': 0, 'speech_rate': 0
                })
                return features
            
            energy_sorted = np.sort(energy)
            threshold_idx = max(1, int(len(energy_sorted) * 0.3))
            energy_threshold = energy_sorted[threshold_idx]
            
            speech_frames = energy > energy_threshold
            frame_times = librosa.frames_to_time(range(len(speech_frames)), sr=sr, hop_length=hop_length)
            
            speech_segments = []
            pause_segments = []
            
            in_speech = False
            current_start = 0
            min_segment_duration = 0.1
            
            for i, is_speech in enumerate(speech_frames):
                current_time = frame_times[i] if i < len(frame_times) else frame_times[-1]
                
                if is_speech and not in_speech:
                    if i > 0:
                        segment_duration = current_time - current_start
                        if segment_duration >= min_segment_duration:
                            pause_segments.append((current_start, current_time))
                    current_start = current_time
                    in_speech = True
                elif not is_speech and in_speech:
                    segment_duration = current_time - current_start
                    if segment_duration >= min_segment_duration:
                        speech_segments.append((current_start, current_time))
                    current_start = current_time
                    in_speech = False
            
            final_time = len(audio) / sr
            if in_speech:
                if final_time - current_start >= min_segment_duration:
                    speech_segments.append((current_start, final_time))
            else:
                if final_time - current_start >= min_segment_duration:
                    pause_segments.append((current_start, final_time))
            
            speech_durations = [end - start for start, end in speech_segments]
            pause_durations = [end - start for start, end in pause_segments 
                             if end - start > 0.05]
            
            if speech_durations:
                features['dur_mean'] = float(np.mean(speech_durations))
                features['dur_std'] = float(np.std(speech_durations))
                features['dur_median'] = float(np.median(speech_durations))
                features['dur_max'] = float(np.max(speech_durations))
                features['dur_min'] = float(np.min(speech_durations))
                features['number_utt'] = len(speech_segments)
            else:
                features.update({
                    'dur_mean': 0, 'dur_std': 0, 'dur_median': 0,
                    'dur_max': 0, 'dur_min': 0, 'number_utt': 0
                })
            
            if pause_durations:
                features['sildur_mean'] = float(np.mean(pause_durations))
                features['sildur_std'] = float(np.std(pause_durations))
                features['sildur_median'] = float(np.median(pause_durations))
                features['sildur_max'] = float(np.max(pause_durations))
                features['sildur_min'] = float(np.min(pause_durations))
            else:
                features.update({
                    'sildur_mean': 0, 'sildur_std': 0, 'sildur_median': 0,
                    'sildur_max': 0, 'sildur_min': 0
                })
            
            total_time = len(audio) / sr
            if total_time > 0:
                features['speech_rate'] = float(len(speech_segments) / (total_time / 60))
            else:
                features['speech_rate'] = 0
                
        except Exception as e:
            print(f"Speech/pause detection error: {e}")
            features.update({
                'dur_mean': 0, 'dur_std': 0, 'dur_median': 0,
                'dur_max': 0, 'dur_min': 0, 'number_utt': 0,
                'sildur_mean': 0, 'sildur_std': 0, 'sildur_median': 0,
                'sildur_max': 0, 'sildur_min': 0, 'speech_rate': 0
            })
            
        return features
    
    def extract_all_features(self, file_path: str, participant_info: Dict = None) -> Dict[str, Any]:
        """Trích xuất tất cả đặc trưng từ file âm thanh"""
        try:
            audio, sr = self.load_audio(file_path)
            features = {}
            
            if participant_info:
                features.update(participant_info)
            
            features['filename'] = os.path.basename(file_path)
            features.update(self.extract_basic_features(audio, sr))
            features.update(self.extract_pitch_features(audio, sr))
            features.update(self.extract_mfcc_features(audio, sr))
            features.update(self.detect_pauses_and_speech(audio, sr))
            
            return features
            
        except Exception as e:
            print(f"Feature extraction failed: {e}")
            return {
                'filename': os.path.basename(file_path) if file_path else 'unknown',
                'duration_total': 0,
                'energy_mean': 0,
                'speech_rate': 0,
                'number_utt': 0,
                'error': str(e)
            }

# ========================== TEXT ANALYZER ==========================
class TextAnalyzer:
    """Phân tích văn bản cơ bản"""
    
    def basic_text_analysis(self, text: str) -> Dict[str, Any]:
        """Phân tích văn bản cơ bản"""
        if not text or text.strip() == "":
            return {
                "word_count": 0,
                "unique_words": 0,
                "repetition_rate": 0,
                "sentence_count": 0,
                "avg_words_per_sentence": 0,
                "vocabulary_diversity": 0,
                "coherence_score": 1,
                "vocabulary_score": 1,
                "syntax_score": 1,
                "relevance_score": 1,
                "fluency_score": 1,
                "overall_score": 1,
                "detailed_analysis": "Không có nội dung văn bản để phân tích"
            }
        
        words = text.lower().split()
        unique_words = set(words)
        
        repetition_rate = 1 - (len(unique_words) / len(words)) if len(words) > 0 else 0
        sentences = max(1, text.count('.') + text.count('!') + text.count('?'))
        avg_words_per_sentence = len(words) / sentences if sentences > 0 else 0
        vocabulary_diversity = len(unique_words) / len(words) if len(words) > 0 else 0
        
        coherence_score = min(10, max(1, 10 - repetition_rate * 5))
        vocabulary_score = min(10, max(1, vocabulary_diversity * 10))
        syntax_score = min(10, max(1, avg_words_per_sentence / 2))
        relevance_score = min(10, max(1, len(words) / 10))
        fluency_score = min(10, max(1, 10 - repetition_rate * 3))
        
        overall_score = (coherence_score + vocabulary_score + syntax_score + 
                        relevance_score + fluency_score) / 5
        
        return {
            "word_count": len(words),
            "unique_words": len(unique_words),
            "repetition_rate": float(repetition_rate),
            "sentence_count": sentences,
            "avg_words_per_sentence": float(avg_words_per_sentence),
            "vocabulary_diversity": float(vocabulary_diversity),
            "detailed_analysis": f"Phân tích cơ bản: {len(words)} từ, {len(unique_words)} từ độc đáo, tỉ lệ lặp {repetition_rate:.2%}",
            "coherence_score": float(coherence_score),
            "vocabulary_score": float(vocabulary_score),
            "syntax_score": float(syntax_score),
            "relevance_score": float(relevance_score),
            "fluency_score": float(fluency_score),
            "overall_score": float(overall_score)
        }

# ========================== COGNITIVE ASSESSMENT ==========================
class CognitiveAssessment:
    """Tổng hợp đánh giá nhận thức với thang điểm 30"""
    
    def __init__(self, max_score=100):
        self.audio_extractor = AudioFeatureExtractor()
        self.text_analyzer = TextAnalyzer()
        self.max_score = max_score
        
    def assess_audio_file(self, audio_path: str, transcribed_text: str, 
                         participant_info: Dict = None) -> Dict[str, Any]:
        """Đánh giá toàn diện một file âm thanh"""
        
        try:
            audio_features = self.audio_extractor.extract_all_features(audio_path, participant_info)
            text_analysis = self.text_analyzer.basic_text_analysis(transcribed_text)
            
            assessment = {
                "participant_info": participant_info or {},
                "audio_features": audio_features,
                "text_analysis": text_analysis,
                "combined_assessment": self._combine_assessments(audio_features, text_analysis)
            }
            
            return assessment
            
        except Exception as e:
            print(f"Assessment error: {e}")
            return {
                "participant_info": participant_info or {},
                "audio_features": {"error": str(e)},
                "text_analysis": self.text_analyzer.basic_text_analysis(transcribed_text),
                "combined_assessment": {
                    "audio_score": 0,
                    "text_score": 0,
                    "combined_score": 0,
                    "risk_level": "Error in assessment",
                    "recommendations": [f"Lỗi trong quá trình đánh giá: {str(e)}"]
                }
            }
    
    def _combine_assessments(self, audio_features: Dict, text_analysis: Dict) -> Dict[str, Any]:
        """Kết hợp đánh giá âm thanh và văn bản với thang điểm mới"""
        
        audio_score = self._calculate_audio_score(audio_features)
        text_score = (text_analysis.get('overall_score', 1) / 10) * self.max_score
        
        combined_score = (audio_score * 0.4) + (text_score * 0.6)
        risk_level = self._classify_risk(combined_score)
        
        return {
            "audio_score": float(audio_score),
            "text_score": float(text_score),
            "combined_score": float(combined_score),
            "max_score": self.max_score,
            "risk_level": risk_level,
            "recommendations": self._generate_recommendations(combined_score, audio_features, text_analysis)
        }
    
    def _calculate_audio_score(self, features: Dict) -> float:
        """Tính điểm từ các đặc trưng âm thanh theo thang điểm mới"""
        if 'error' in features:
            return 0.0
            
        score = self.max_score
        
        speech_rate = features.get('speech_rate', 0)
        if speech_rate < 30:
            score -= self.max_score * 0.2
        elif speech_rate > 180:
            score -= self.max_score * 0.1
            
        pause_mean = features.get('sildur_mean', 0)
        if pause_mean > 2.0:
            score -= self.max_score * 0.15
        elif pause_mean < 0.2:
            score -= self.max_score * 0.1
            
        pitch_std = features.get('pitch_std', 0)
        if pitch_std < 10:
            score -= self.max_score * 0.15
            
        num_utt = features.get('number_utt', 0)
        if num_utt < 5:
            score -= self.max_score * 0.2
            
        return max(0, float(score))
    
    def _classify_risk(self, score: float) -> str:
        """Phân loại mức độ rủi ro dựa trên thang điểm mới"""
        percentage = (score / self.max_score) * 100
        
        if percentage >= 80:
            return "Low Risk - Bình thường"
        elif percentage >= 60:
            return "Moderate Risk - Cần theo dõi"
        elif percentage >= 40:
            return "High Risk - Cần can thiệp"
        else:
            return "Very High Risk - Cần đánh giá chuyên sâu"
    
    def _generate_recommendations(self, score: float, audio_features: Dict, text_analysis: Dict) -> List[str]:
        """Đưa ra khuyến nghị dựa trên kết quả đánh giá"""
        recommendations = []
        percentage = (score / self.max_score) * 100
        
        if percentage < 60:
            recommendations.append("Nên gặp bác sĩ chuyên khoa để đánh giá thêm")
            
        if audio_features.get('speech_rate', 0) < 30:
            recommendations.append("Tốc độ nói chậm - có thể cần kiểm tra chức năng vận động")
            
        if audio_features.get('sildur_mean', 0) > 2.0:
            recommendations.append("Khoảng nghỉ dài giữa các từ - cần đánh giá khả năng tìm từ")
            
        if text_analysis.get('vocabulary_score', 5) < 5:
            recommendations.append("Từ vựng hạn chế - nên tham gia hoạt động kích thích nhận thức")
            
        if text_analysis.get('coherence_score', 5) < 4:
            recommendations.append("Khó khăn trong tổ chức ý tưởng - cần đánh giá chức năng điều hành")
            
        if len(recommendations) == 0:
            recommendations.append("Kết quả trong khoảng bình thường - tiếp tục duy trì hoạt động nhận thức")
            
        return recommendations

# ========================== FLASK APP ==========================

# Global assessor instance
assessor = None

def initialize_system(max_score=100):
    """Khởi tạo hệ thống đánh giá"""
    global assessor
    assessor = CognitiveAssessment(max_score=max_score)
    print(f"Cognitive Assessment System initialized with max score: {max_score}")

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'message': 'Cognitive Assessment API is running',
        'max_score': assessor.max_score if assessor else 100,
        'timestamp': datetime.now().isoformat()
    })

@app.route('/initialize', methods=['POST'])
def initialize():
    """Initialize system with custom max_score"""
    try:
        data = request.get_json() if request.is_json else {}
        max_score = data.get('max_score', 100) if data else 100
        
        initialize_system(max_score)
        
        return jsonify({
            'success': True,
            'message': f'System initialized with max score: {max_score}',
            'max_score': max_score,
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/assess-file', methods=['POST'])
def assess_file():
    """API endpoint để thực hiện đánh giá với file upload"""
    try:
        if assessor is None:
            return jsonify({
                'success': False, 
                'error': 'System not initialized. Call /initialize first.'
            }), 500
        
        # Lấy thông tin từ form
        audio_file = request.files.get('audioFile')
        if not audio_file:
            return jsonify({
                'success': False,
                'error': 'No audio file provided'
            }), 400
        
        # Lấy thông tin khác
        age = int(request.form.get('age', 0))
        gender = request.form.get('gender', '')
     
        transcribed_text = request.form.get('transcribedText', '')
        user_id = request.form.get('userId', 'unknown_user')
        question = request.form.get('question', '')
        question_id = request.form.get('questionId', '')
        
        # Lưu file tạm thời
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp_file:
            audio_file.save(tmp_file.name)
            audio_path = tmp_file.name
        
        try:
            # Auto transcribe nếu chưa có transcribed_text
            if not transcribed_text or transcribed_text.strip() == '':
                try:
                    import whisper
                    model = whisper.load_model("base")
                    wres = model.transcribe(audio_path)
                    transcribed_text = wres.get('text', '') or ''
                except Exception as e:
                    transcribed_text = ''
            
            # Lưu transcript ra frontend/text-records với tên user-question
            try:
                transcript_dir = os.path.join('..', 'frontend', 'text-records')
                os.makedirs(transcript_dir, exist_ok=True)
                safe_user = user_id.replace('@', '_').replace('.', '_')
                safe_qid = f"q{question_id}" if question_id else ""
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                base_name = f"{safe_user}_{safe_qid}_{timestamp}" if safe_qid else f"{safe_user}_{timestamp}"
                txt_filename = os.path.join(transcript_dir, f"{base_name}.txt")
                with open(txt_filename, 'w', encoding='utf-8') as ftxt:
                    ftxt.write(transcribed_text)
                print(f"Transcript saved: {os.path.abspath(txt_filename)}")
            except Exception as e:
                print(f"Cannot save transcript: {e}")
            
           
            gpt_eval = {}
            try:
                openai_key = os.getenv('OPENAI_API_KEY')
                if openai_key and transcribed_text:
                    client = OpenAI(api_key=openai_key)
                    template_path = os.path.join('prompts', 'gpt_eval_template.txt')
                    try:
                        with open(template_path, 'r', encoding='utf-8') as pf:
                            prompt = pf.read()
                        prompt = prompt.replace('{{QUESTION}}', question or '')
                        prompt = prompt.replace('{{TRANSCRIPT}}', transcribed_text or '')
                    except Exception:
                        prompt = f"Câu hỏi: '{question}'. Transcript: '{transcribed_text}'. Hãy chấm điểm JSON theo template đã mô tả."
                    completion = client.chat.completions.create(
                        model="o4-mini-2025-04-16", # model ưu tiên
                        messages=[{"role": "user", "content": prompt}],
                        temperature=0.2,
                        max_tokens=256
                    )
                    import re, json as pyjson
                    gpt_text = completion.choices[0].message.content
                    try:
                        json_str = re.search(r'\{[\s\S]*\}', gpt_text).group(0)
                        gpt_eval = pyjson.loads(json_str)
                    except Exception:
                        gpt_eval = {}
            except Exception as e:
                print(f"GPT evaluation error: {e}")
            
            # Thông tin người tham gia
            participant_info = {
                'age': age,
                'gender': gender,
             
            }
            
            # Thực hiện đánh giá âm học + text
            result = assessor.assess_audio_file(
                audio_path=audio_path,
                transcribed_text=transcribed_text,
                participant_info=participant_info
            )
            
            # Gộp kết quả GPT vào text_analysis nếu có
            if gpt_eval:
                ta = result.get('text_analysis', {})
                ta['semantic_accuracy'] = float(gpt_eval.get('semantic_accuracy', ta.get('overall_score', 0)))
                ta['vocabulary_score'] = float(gpt_eval.get('vocabulary_richness', ta.get('vocabulary_score', 0)))
                ta['repetition_rate'] = float(gpt_eval.get('repetition_rate', ta.get('repetition_rate', 0)))
                ta['reasoning_quality'] = float(gpt_eval.get('reasoning_quality', 0))
                ta['detailed_analysis'] = gpt_eval.get('notes', ta.get('detailed_analysis', ''))
                result['text_analysis'] = ta
                # Điều chỉnh text_score (0-10) từ semantic/vocab/repetition/reasoning
                language10 = (
                    ta.get('semantic_accuracy', 0) +
                    ta.get('vocabulary_score', ta.get('vocabulary_richness', 0)) +
                    (10 - (ta.get('repetition_rate', 0) * 10)) +
                    ta.get('reasoning_quality', 0)
                ) / 4.0
                # map sang 0-max_score theo logic combine nội bộ
                combined = result.get('combined_assessment', {})
                # giữ nguyên audio_score, thay text_score theo language10 thang max_score
                max_score = assessor.max_score
                combined['text_score'] = float((language10 / 10.0) * max_score)
                # tính lại combined_score với trọng số đã định trong hàm
                # dùng lại _combine_assessments để đảm bảo nhất quán
                result['combined_assessment'] = assessor._combine_assessments(
                    result.get('audio_features', {}), ta
                )
            
            # Lưu kết quả (bao gồm transcribed_text)
            save_result(result, participant_info, transcribed_text=transcribed_text)
            
            return jsonify({
                'success': True,
                'data': result,
                'timestamp': datetime.now().isoformat()
            })
            
        finally:
            # Xóa file tạm
            if os.path.exists(audio_path):
                os.unlink(audio_path)
                
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat(),
            'traceback': traceback.format_exc()
        }), 500

@app.route('/assess', methods=['POST'])
def assess():
    """API endpoint để thực hiện đánh giá với đường dẫn file"""
    try:
        if assessor is None:
            return jsonify({
                'success': False, 
                'error': 'System not initialized. Call /initialize first.'
            }), 500
        
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No JSON data provided'
            }), 400
        
        # Extract required fields
        audio_path = data.get('audio_path')
        transcribed_text = data.get('transcribed_text', '')
        participant_info = data.get('participant_info', {})
        
        if not audio_path:
            return jsonify({
                'success': False,
                'error': 'audio_path is required'
            }), 400
        
        # Kiểm tra file có tồn tại không
        if not os.path.exists(audio_path):
            return jsonify({
                'success': False,
                'error': f'Audio file not found: {audio_path}'
            }), 400
        
        # Thực hiện đánh giá
        result = assessor.assess_audio_file(
            audio_path=audio_path,
            transcribed_text=transcribed_text,
            participant_info=participant_info
        )
        
        # Lưu kết quả
        save_result(result, participant_info)
        
        return jsonify({
            'success': True,
            'data': result,
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat(),
            'traceback': traceback.format_exc()
        }), 500

@app.route('/results', methods=['GET'])
def get_results():
    """Lấy danh sách kết quả đã lưu"""
    try:
        results_dir = 'results'
        if not os.path.exists(results_dir):
            return jsonify({
                'success': True,
                'data': [],
                'message': 'No results found'
            })
        
        files = [f for f in os.listdir(results_dir) if f.endswith('.json')]
        files.sort(reverse=True)  # Mới nhất trước
        
        results = []
        for file in files[:50]:  # Lấy 50 kết quả gần nhất
            try:
                with open(os.path.join(results_dir, file), 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    results.append({
                        'filename': file,
                        'timestamp': data.get('timestamp', ''),
                        'participant_info': data.get('participant_info', {}),
                        'combined_score': data.get('combined_assessment', {}).get('combined_score', 0),
                        'risk_level': data.get('combined_assessment', {}).get('risk_level', 'Unknown'),
                        'summary': {
                            'audio_score': data.get('combined_assessment', {}).get('audio_score', 0),
                            'text_score': data.get('combined_assessment', {}).get('text_score', 0)
                        }
                    })
            except Exception as e:
                continue
        
        return jsonify({
            'success': True,
            'data': results,
            'count': len(results)
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/results/<filename>', methods=['GET'])
def get_result_detail(filename):
    """Lấy chi tiết một kết quả cụ thể"""
    try:
        filepath = os.path.join('results', filename)
        if not os.path.exists(filepath):
            return jsonify({
                'success': False,
                'error': 'Result file not found'
            }), 404
        
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        return jsonify({
            'success': True,
            'data': data
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

def save_result(result, participant_info, transcribed_text=''):
    """Lưu kết quả đánh giá vào file"""
    try:
        os.makedirs('results', exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"results/assessment_{timestamp}.json"
        
        result['timestamp'] = timestamp
        result['participant_info'] = participant_info
        result['transcribed_text'] = transcribed_text # Lưu transcribed_text vào kết quả
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2, default=str)
            
        print(f"Result saved: {filename}")
        
    except Exception as e:
        print(f"Error saving result: {e}")

@app.errorhandler(413)
def too_large(e):
    """Handle file too large error"""
    return jsonify({
        'success': False,
        'error': 'File too large. Maximum size is 50MB.'
    }), 413

@app.errorhandler(500)
def internal_error(e):
    """Handle internal server errors"""
    return jsonify({
        'success': False,
        'error': 'Internal server error',
        'timestamp': datetime.now().isoformat()
    }), 500

if __name__ == '__main__':
    # Initialize system on startup
    initialize_system(max_score=100)
    
    print("=" * 60)
    print("🚀 Starting Cognitive Assessment API Server")
    print("=" * 60)
    print("📡 Endpoints available:")
    print("  GET  /health          - Health check")
    print("  POST /initialize      - Initialize system with custom max_score")
    print("  POST /assess          - Perform assessment (with file path)")
    print("  POST /assess-file     - Perform assessment (with file upload)")
    print("  GET  /results         - Get all results")
    print("  GET  /results/<file>  - Get specific result details")
    print("")
    print("🌐 Server running on: http://localhost:5001")
    print("🔧 CORS enabled for cross-origin requests")
    print("📁 Max file size: 50MB")
    print("=" * 60)
    
    app.run(debug=True, host='0.0.0.0', port=5001)