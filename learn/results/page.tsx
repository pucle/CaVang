"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";

interface ResultItem {
  filename?: string;
  timestamp?: string;
  participant_info?: any;
  combined_score?: number;
  risk_level?: string;
  combined_assessment?: {
    combined_score?: number;
    risk_level?: string;
  };
}

export default function ResultsPage() {
  const [latest, setLatest] = useState<ResultItem | null>(null);
  const [list, setList] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const base = process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL || 'http://localhost:5000';
        const res = await fetch(`${base}/results`);
        if (res.ok) {
          const data = await res.json();
          const items: ResultItem[] = data.data || data.results || [];
          setList(items);
          if (items.length > 0) setLatest(items[0]);
        }
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const latestScore = (() => {
    if (!latest) return null;
    let score = latest.combined_assessment?.combined_score ?? latest.combined_score;
    if (typeof score === 'number' && score <= 30) score = Math.min(100, (score / 30) * 100);
    return typeof score === 'number' ? Math.max(0, Math.min(100, score)) : null;
  })();

  const risk = latest?.combined_assessment?.risk_level || latest?.risk_level;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-800">Kết quả bài kiểm tra</h1>

        <Card className="p-5 bg-white/90">
          {loading ? (
            <div>Đang tải kết quả...</div>
          ) : latest ? (
            <div className="space-y-2">
              <div className="text-lg font-semibold">Kết quả gần nhất</div>
              <div className="text-gray-700">Thời gian: {latest.timestamp || 'N/A'}</div>
              <div className="text-gray-900 text-xl font-bold">Điểm: {latestScore?.toFixed(1) || 'N/A'}/100</div>
              <div className="text-gray-700">Tình trạng: {risk || 'N/A'}</div>
            </div>
          ) : (
            <div>Chưa có kết quả nào.</div>
          )}
        </Card>

        <Card className="p-5 bg-white/90">
          <div className="text-lg font-semibold mb-3">Lịch sử gần đây</div>
          {list.length === 0 ? (
            <div className="text-gray-600">Không có dữ liệu.</div>
          ) : (
            <div className="divide-y">
              {list.slice(0, 10).map((item, idx) => {
                const score = (() => {
                  let s = item.combined_assessment?.combined_score ?? item.combined_score;
                  if (typeof s === 'number' && s <= 30) s = Math.min(100, (s / 30) * 100);
                  return typeof s === 'number' ? Math.max(0, Math.min(100, s)) : null;
                })();
                return (
                  <div key={idx} className="py-2 flex justify-between text-sm">
                    <div className="text-gray-700">{item.timestamp || 'N/A'}</div>
                    <div className="text-gray-900 font-semibold">{score?.toFixed(1) || 'N/A'}/100</div>
                    <div className="text-gray-600">{item.combined_assessment?.risk_level || item.risk_level || 'N/A'}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div className="flex gap-3">
          <Link href="/menu" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Về Menu</Link>
          <Link href="/learn/memory-test" className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">Làm lại bài test</Link>
        </div>
      </div>
    </div>
  );
}
