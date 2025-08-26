// app/(main)/learn/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Header } from "./header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Loader2, Brain, Play, Clock, Mic, CheckCircle, AlertTriangle, Volume2 } from "lucide-react";

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

export default function LearnPage() {
  const router = useRouter();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [greeting, setGreeting] = useState("");

  useEffect(() => {
    fetchUserData();
  }, []);

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
    const age = parseInt(data.age);
    // Lấy 2 chữ cái cuối trong tên theo văn hóa Việt Nam
    const nameParts = data.name.trim().split(' ');
    const firstName = nameParts[nameParts.length - 1]; // Lấy từ cuối cùng (tên)
    
    if (age <= 30) {
      setGreeting(`Chào ${firstName}`);
    } else if (age <= 50) {
      const title = data.gender === "Nam" ? "chú" : "cô";
      setGreeting(`Chào ${title} ${firstName}`);
    } else {
      const title = data.gender === "Nam" ? "ông" : "bà";
      setGreeting(`Chào ${title} ${firstName}`);
    }
  };

  const handleStartTest = () => {
    router.push("/learn/memory-test");
  };

  if (isLoading) {
    return (
      <div className="absolute inset-0 lg:left-[256px] bg-gradient-to-br from-blue-50 via-cyan-50 to-green-50 flex items-center justify-center">
        <div className="text-center bg-white rounded-3xl p-12 shadow-2xl">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          >
            <Brain className="h-16 w-16 mx-auto mb-6 text-purple-600" />
          </motion.div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Đang tải thông tin</h2>
          <p className="text-lg text-gray-600">Vui lòng đợi trong giây lát...</p>
          <div className="w-48 bg-gray-200 rounded-full h-3 mt-6 mx-auto">
            <motion.div
              className="h-3 bg-purple-600 rounded-full"
              animate={{ width: ["0%", "100%"] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 lg:left-[256px] bg-gradient-to-br from-blue-50 via-cyan-50 to-green-50 overflow-auto min-h-screen">
      <Header title="Kiểm tra trí nhớ" />
      
      <div className="flex items-center justify-center min-h-[calc(100vh-120px)] px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-4xl"
        >
          <Card className="p-10 md:p-16 backdrop-blur-xl bg-white/98 shadow-2xl rounded-3xl border-2 border-white/50">
            {/* Large welcome icon */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
              className="text-center mb-10"
            >
              <div className="bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center w-32 h-32 mx-auto mb-8 shadow-2xl border-4 border-white">
                <Brain className="w-16 h-16 text-white" />
              </div>

              {/* Large greeting */}
              <motion.h1 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-5xl md:text-6xl font-bold text-gray-800 mb-6 leading-tight"
              >
                {greeting}!
              </motion.h1>

              {/* Welcome message */}
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="text-2xl md:text-3xl text-gray-700 mb-10 leading-relaxed font-medium"
              >
                Chào mừng bạn đến với <br/>
                <span className="font-bold text-purple-600 text-3xl md:text-4xl">
                  Bài Kiểm Tra Trí Nhớ
                </span>
              </motion.p>
            </motion.div>

            {/* Test description with large, clear sections */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 }}
              className="space-y-6 mb-10"
            >
              {/* What's included */}
              <div className="bg-blue-50 rounded-2xl p-8 border-2 border-blue-200">
                <h2 className="text-2xl font-bold text-blue-800 mb-6 flex items-center">
                  <Brain className="w-8 h-8 mr-4" />
                  Bài kiểm tra bao gồm:
                </h2>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="w-6 h-6 text-blue-600 mt-1 flex-shrink-0" />
                    <span className="text-xl text-blue-700 leading-relaxed">
                      Câu hỏi về thông tin cá nhân và định hướng
                    </span>
                  </div>
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="w-6 h-6 text-blue-600 mt-1 flex-shrink-0" />
                    <span className="text-xl text-blue-700 leading-relaxed">
                      Bài tập ghi nhớ và lặp lại từ ngữ
                    </span>
                  </div>
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="w-6 h-6 text-blue-600 mt-1 flex-shrink-0" />
                    <span className="text-xl text-blue-700 leading-relaxed">
                      Thử thách tập trung và tính toán
                    </span>
                  </div>
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="w-6 h-6 text-blue-600 mt-1 flex-shrink-0" />
                    <span className="text-xl text-blue-700 leading-relaxed">
                      Bài tập hồi tưởng và ngôn ngữ
                    </span>
                  </div>
                </div>
              </div>

              {/* Time and format info */}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-green-50 rounded-2xl p-6 border-2 border-green-200">
                  <div className="flex items-center mb-4">
                    <Clock className="w-8 h-8 text-green-600 mr-3" />
                    <h3 className="text-xl font-bold text-green-800">Thời gian</h3>
                  </div>
                  <p className="text-lg text-green-700 leading-relaxed">
                    Khoảng <strong>15-20 phút</strong><br/>
                    Làm bài theo nhịp độ thoải mái
                  </p>
                </div>

                <div className="bg-orange-50 rounded-2xl p-6 border-2 border-orange-200">
                  <div className="flex items-center mb-4">
                    <Mic className="w-8 h-8 text-orange-600 mr-3" />
                    <h3 className="text-xl font-bold text-orange-800">Định dạng</h3>
                  </div>
                  <p className="text-lg text-orange-700 leading-relaxed">
                    Trả lời bằng <strong>giọng nói</strong><br/>
                    Hệ thống sẽ ghi âm câu trả lời
                  </p>
                </div>
              </div>

              {/* Important notes */}
              <div className="bg-yellow-50 rounded-2xl p-8 border-2 border-yellow-300">
                <div className="flex items-start">
                  <AlertTriangle className="w-10 h-10 text-yellow-600 mr-4 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="text-2xl font-bold text-yellow-800 mb-4">Lưu ý quan trọng:</h3>
                    <div className="space-y-3 text-lg text-yellow-700">
                      <div className="flex items-start">
                        <Volume2 className="w-6 h-6 mr-3 mt-1 flex-shrink-0" />
                        <span>Đảm bảo <strong>microphone hoạt động tốt</strong> và môi trường yên tĩnh</span>
                      </div>
                      <div className="flex items-start">
                        <CheckCircle className="w-6 h-6 mr-3 mt-1 flex-shrink-0" />
                        <span>Hệ thống sẽ <strong>đọc to câu hỏi</strong> để bạn nghe rõ</span>
                      </div>
                      <div className="flex items-start">
                        <Brain className="w-6 h-6 mr-3 mt-1 flex-shrink-0" />
                        <span>Hãy trả lời <strong>tự nhiên và chính xác</strong> nhất có thể</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Large start button */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.2, type: "spring", stiffness: 200 }}
              className="text-center"
            >
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  onClick={handleStartTest}
                  className="w-full max-w-md mx-auto text-2xl font-bold py-8 px-12 rounded-3xl bg-gradient-to-r from-green-600 to-blue-600 text-white shadow-2xl hover:shadow-3xl transition-all duration-300 border-4 border-white hover:from-green-700 hover:to-blue-700 transform hover:scale-105"
                >
                  <Play className="w-8 h-8 mr-4" />
                  Bắt Đầu Kiểm Tra
                </Button>
              </motion.div>
              
              <p className="text-lg text-gray-600 mt-6 font-medium">
                Nhấn nút trên để bắt đầu bài kiểm tra
              </p>
            </motion.div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}