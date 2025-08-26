import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

interface Props {
  title: string;
}

export const Header = ({ title }: Props) => {
  return (
    <div className="w-full flex items-center justify-between bg-green-400 rounded-3xl shadow-lg py-6 px-6 mb-10 mt-2">
      <Link href="/menu">
        <Button variant="ghost" size="sm" className="bg-white/70 hover:bg-white/90 rounded-full">
          <ArrowLeft className="h-6 w-6 text-blue-500" />
        </Button>
      </Link>
      <div className="flex items-center gap-4">
        <Image src="/mascot.svg" alt="Mascot" width={44} height={44} className="rounded-2xl shadow-md" />
        <h1 className="font-extrabold text-2xl md:text-3xl text-white tracking-wide drop-shadow-lg">
          {title}
        </h1>
      </div>
      <div />
    </div>
  );
};