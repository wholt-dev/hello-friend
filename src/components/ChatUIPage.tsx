// Static dummy chat template UI — exact visual replica of the provided template.
// Self-contained, no business logic. Does not interact with any other section.
import React, { useState } from "react";
import {
  Menu, MessageCircle, Phone, CircleFadingPlus, Settings, User2, ChevronUp,
  SquarePen, ListFilter, Search, Video, Smile, Paperclip, Send, Mic,
  User, Users, MessageSquareDot, Star, CircleUserRound, CircleOff,
  MessageSquareDashed, Image as ImageIcon, Camera, File as FileIcon,
  UserRound, ChartBarIncreasing, Brush,
} from "lucide-react";
import { cn } from "@/lib/utils";

const contactList = [
  { name: "Manoj Rayi",     message: "Your Last Message Here",        image: "https://github.com/rayimanoj8.png" },
  { name: "Anjali Kumar",   message: "Hello, how are you?",           image: "https://randomuser.me/api/portraits/women/2.jpg" },
  { name: "Ravi Teja",      message: "Looking forward to the meeting.", image: "https://randomuser.me/api/portraits/men/3.jpg" },
  { name: "Sneha Reddy",    message: "Can you send the report?",      image: "https://randomuser.me/api/portraits/women/4.jpg" },
  { name: "Arjun Das",      message: "Thank you for your help!",      image: "https://randomuser.me/api/portraits/men/5.jpg" },
  { name: "Priya Sharma",   message: "Let's catch up soon.",          image: "https://randomuser.me/api/portraits/women/6.jpg" },
  { name: "Vikram Singh",   message: "I will call you later.",        image: "https://randomuser.me/api/portraits/men/7.jpg" },
  { name: "Kavya Rao",      message: "Did you receive my email?",     image: "https://randomuser.me/api/portraits/women/8.jpg" },
  { name: "Rahul Verma",    message: "Meeting rescheduled to tomorrow.", image: "https://randomuser.me/api/portraits/men/9.jpg" },
  { name: "Deepika Nair",   message: "Happy birthday! Have a great day!", image: "https://randomuser.me/api/portraits/women/10.jpg" },
  { name: "Rohit Malhotra", message: "What's the update?",            image: "https://randomuser.me/api/portraits/men/11.jpg" },
  { name: "Neha Gupta",     message: "Hope you're doing well!",       image: "https://randomuser.me/api/portraits/women/12.jpg" },
  { name: "Amit Yadav",     message: "Let's finalize the project.",   image: "https://randomuser.me/api/portraits/men/13.jpg" },
  { name: "Simran Kaur",    message: "Good morning!",                 image: "https://randomuser.me/api/portraits/women/14.jpg" },
  { name: "Varun Chopra",   message: "I'll send the documents soon.", image: "https://randomuser.me/api/portraits/men/15.jpg" },
  { name: "Meera Joshi",    message: "How was your weekend?",         image: "https://randomuser.me/api/portraits/women/16.jpg" },
  { name: "Karthik Reddy",  message: "Please confirm the time.",      image: "https://randomuser.me/api/portraits/men/17.jpg" },
  { name: "Pooja Sharma",   message: "See you at the event!",         image: "https://randomuser.me/api/portraits/women/18.jpg" },
  { name: "Sandeep Kumar",  message: "Just checking in.",             image: "https://randomuser.me/api/portraits/men/19.jpg" },
  { name: "Lavanya Patel",  message: "Don't forget the meeting.",     image: "https://randomuser.me/api/portraits/women/20.jpg" },
];

const menuItems = [
  { title: "Messages", icon: MessageCircle },
  { title: "Phone", icon: Phone },
  { title: "Status", icon: CircleFadingPlus },
];

const Avatar: React.FC<{ src?: string; name: string; size?: number }> = ({ src, name, size = 48 }) => (
  <div
    className="rounded-full overflow-hidden shrink-0 bg-zinc-800 flex items-center justify-center text-white text-sm font-semibold"
    style={{ width: size, height: size }}
  >
    {src ? (
      <img src={src} alt={name} className="w-full h-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
    ) : (
      <span>{name[0]}</span>
    )}
  </div>
);

const IconBtn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }> = ({ className, children, ...p }) => (
  <button
    {...p}
    className={cn(
      "h-9 w-9 inline-flex items-center justify-center rounded-md text-zinc-300 hover:bg-white/5 hover:text-white transition-colors",
      className
    )}
  >
    {children}
  </button>
);

export default function ChatUIPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentChat, setCurrentChat] = useState(contactList[0]);

  return (
    <div className="w-full min-h-[calc(100vh-120px)] mt-20 px-2 sm:px-4">
      <div className="max-w-[1480px] mx-auto bg-zinc-950 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex h-[calc(100vh-160px)] min-h-[600px]">
          {/* ===== Sidebar (Navigate) ===== */}
          <aside
            className={cn(
              "shrink-0 border-r border-white/10 bg-zinc-950 flex flex-col transition-[width] duration-200",
              sidebarOpen ? "w-[200px]" : "w-[60px]"
            )}
          >
            <div className="p-3">
              {sidebarOpen && (
                <div className="text-[11px] font-semibold text-zinc-400 px-2 py-1.5">Navigate</div>
              )}
              <button
                onClick={() => setSidebarOpen((v) => !v)}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-zinc-300 hover:bg-white/5 hover:text-white"
              >
                <Menu size={18} />
              </button>
              {menuItems.map((m) => (
                <a
                  key={m.title}
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-zinc-300 hover:bg-white/5 hover:text-white"
                >
                  <m.icon size={18} />
                  {sidebarOpen && <span className="text-sm">{m.title}</span>}
                </a>
              ))}
            </div>

            <div className="mt-auto p-3 space-y-1">
              <button className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-zinc-300 hover:bg-white/5 hover:text-white">
                <Settings size={18} />
                {sidebarOpen && <span className="text-sm">Settings</span>}
              </button>
              <button className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-zinc-300 hover:bg-white/5 hover:text-white">
                <User2 size={18} />
                {sidebarOpen && (
                  <>
                    <span className="text-sm">Manoj Rayi</span>
                    <ChevronUp size={16} className="ml-auto" />
                  </>
                )}
              </button>
            </div>
          </aside>

          {/* ===== Chat List ===== */}
          <section className="w-[300px] shrink-0 border-r border-white/10 bg-zinc-950 flex flex-col">
            <div className="h-12 px-3 flex items-center">
              <p className="text-sm font-medium text-zinc-200">Chats</p>
              <div className="ml-auto flex items-center">
                <IconBtn aria-label="New"><SquarePen size={16} /></IconBtn>
                <IconBtn aria-label="Filter"><ListFilter size={16} /></IconBtn>
              </div>
            </div>

            <div className="relative px-3 pb-3">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input
                placeholder="Search or start new chat"
                className="w-full h-9 pl-9 pr-3 rounded-md bg-zinc-900 border border-white/10 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-white/20"
              />
            </div>

            <div className="flex-1 overflow-y-auto">
              {contactList.map((contact, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentChat(contact)}
                  className={cn(
                    "px-3 w-full py-2 text-left transition-colors",
                    currentChat.name === contact.name ? "bg-white/5" : "hover:bg-white/5"
                  )}
                >
                  <div className="flex flex-row gap-2 items-start">
                    <Avatar src={contact.image} name={contact.name} size={48} />
                    <div className="min-w-0 py-1">
                      <div className="text-[15px] font-semibold text-zinc-100 leading-tight truncate">{contact.name}</div>
                      <div className="text-xs text-zinc-400 mt-1 line-clamp-2">{contact.message}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* ===== Chat Window ===== */}
          <section className="flex-1 flex flex-col bg-zinc-950 min-w-0">
            {/* Header */}
            <div className="h-16 border-b border-white/10 flex items-center px-3">
              <Avatar src={currentChat.image} name={currentChat.name} size={48} />
              <div className="ml-2">
                <div className="text-[15px] font-semibold text-zinc-100">{currentChat.name}</div>
                <div className="text-xs text-zinc-400">Contact Info</div>
              </div>
              <div className="flex-grow flex justify-end gap-1">
                <IconBtn aria-label="Video call"><Video size={18} /></IconBtn>
                <IconBtn aria-label="Phone call"><Phone size={18} /></IconBtn>
                <IconBtn aria-label="Search in chat"><Search size={18} /></IconBtn>
              </div>
            </div>

            {/* Empty body (matches template) */}
            <div className="flex-1 bg-zinc-950" />

            {/* Input */}
            <div className="flex items-center gap-1 px-2 py-2 border-t border-white/10">
              <IconBtn aria-label="Emoji"><Smile size={18} /></IconBtn>
              <IconBtn aria-label="Attach"><Paperclip size={18} /></IconBtn>
              <input
                placeholder="Type a message"
                className="flex-grow h-10 px-3 bg-transparent border-0 outline-none text-sm text-zinc-100 placeholder:text-zinc-500"
              />
              <IconBtn aria-label="Send"><Send size={18} /></IconBtn>
              <IconBtn aria-label="Voice"><Mic size={18} /></IconBtn>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
