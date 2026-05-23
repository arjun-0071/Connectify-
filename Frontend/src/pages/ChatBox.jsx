import { useEffect, useState, useRef } from "react";
import io from "socket.io-client";
import axios from "axios";
import "./chatbox.css";
import { IoSend } from "react-icons/io5";
import { FaSmile } from "react-icons/fa";
import { FaImages } from "react-icons/fa6";
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";
import { encryptText, decryptText } from "./encryption";

const BASE_URL = import.meta.env.VITE_API_URL.replace(/\/$/, "");
const DEFAULT_IMAGE = `${BASE_URL}/default-photo.png`;
const socket = io(BASE_URL, { withCredentials: true });

export const ChatBox = ({ friend, sidebarOpen }) => {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [image, setImage] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const scrollRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const userId = localStorage.getItem("userId");

  const isFriendOnline = onlineUsers.includes(friend?._id);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImage(reader.result); // base64 encoded
      reader.readAsDataURL(file);
    }
    e.target.value = null;
  };

  useEffect(() => {
    if (!friend?._id || !userId) return;

    socket.emit("register", userId);

    const fetchMessages = async () => {
      try {
        const res = await axios.get(`${BASE_URL}/messages/${friend._id}`, {
          withCredentials: true,
        });
        // Normalize sender/recipient to plain strings so comparisons work
        const normalized = res.data.map((msg) => ({
          ...msg,
          sender: msg.sender?._id?.toString?.() || msg.sender?.toString?.() || msg.sender,
          recipient: msg.recipient?._id?.toString?.() || msg.recipient?.toString?.() || msg.recipient,
        }));
        setMessages(normalized);
      } catch (err) {
        console.error("Fetch failed", err);
      }
    };

    fetchMessages();

    socket.on("receive-message", (msg) => {
      if (msg.sender === friend._id || msg.recipient === friend._id) {
        setMessages((prev) => [...prev, msg]);
      }
    });

    // Typing indicator listeners
    socket.on("user-typing", ({ from }) => {
      if (from === friend._id) setIsTyping(true);
    });

    socket.on("user-stop-typing", ({ from }) => {
      if (from === friend._id) setIsTyping(false);
    });

    // Online status listener
    socket.on("online-users", (users) => {
      setOnlineUsers(users);
    });

    return () => {
      socket.off("receive-message");
      socket.off("user-typing");
      socket.off("user-stop-typing");
      socket.off("online-users");
    };
  }, [friend, userId]);

  // Handle typing events with debounce
  const handleTyping = (e) => {
    setText(e.target.value);

    socket.emit("typing", { to: friend._id, from: userId });

    // Clear previous timeout and set a new one
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("stop-typing", { to: friend._id, from: userId });
    }, 1000);
  };

  const sendMessage = async () => {
    if ((!text || [...text].filter((c) => c.trim() !== "").length === 0) && !image) return;

    const encryptedText = encryptText(text);

    const msg = {
      sender: userId,
      recipient: friend._id,
      content: encryptedText,
      image,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, msg]);
    socket.emit("send-message", { to: friend._id, message: msg });
    socket.emit("stop-typing", { to: friend._id, from: userId });

    try {
      await axios.post(
        `${BASE_URL}/send-message`,
        {
          recipientId: friend._id,
          content: encryptedText,
          image,
        },
        { withCredentials: true }
      );
    } catch (err) {
      console.error("Send failed", err);
    }

    setText("");
    setImage(null);
  };

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="chatbox-container">
      <div className={`uu ${sidebarOpen ? "ope" : "clos"}`}>
        <div className="chat-header-info">
          <img
            src={friend.image && !friend.image.includes('undefined') ? friend.image : DEFAULT_IMAGE}
            alt={friend.username}
            onError={(e) => { e.target.src = DEFAULT_IMAGE; }}
          />
          <div className="chat-header-text">
            <h3>{friend.username}</h3>
            <span className={`online-status ${isFriendOnline ? "online" : "offline"}`}>
              {isFriendOnline ? "Online" : "Offline"}
            </span>
          </div>
        </div>
      </div>

      <div className="chat-messages">
        {messages.map((msg, i) => {
          const decryptedText = decryptText(msg.content || "");
          const senderId = msg.sender?._id?.toString?.() || msg.sender?.toString?.() || msg.sender;
          return (
            <div
              key={i}
              className={senderId === userId ? "messa outgoing" : "messa incoming"}
            >
              <p className={senderId === userId ? "out" : "in"}>
                {msg.image && (
                  <img
                    src={msg.image}
                    className="im"
                    alt="sent"
                    style={{ maxWidth: "200px", marginTop: "10px", borderRadius: "10px" }}
                  />
                )}
                {msg.image && <br />}
                {decryptedText}
              </p>
            </div>
          );
        })}
        {isTyping && (
          <div className="typing-indicator">
            <span></span><span></span><span></span>
          </div>
        )}
        <div ref={scrollRef}></div>
      </div>

      <div className="chat-input">
        <input
          value={text}
          className="inpu"
          onChange={handleTyping}
          placeholder="Type your message... (Enter to send)"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
        />

        <label htmlFor="sendimage">
          <FaImages className="send" />
        </label>
        <input
          type="file"
          onChange={handleImageUpload}
          accept="image/*"
          id="sendimage"
          style={{ display: "none" }}
        />

        <FaSmile className="smile" onClick={() => setShowEmojiPicker((prev) => !prev)} />

        {showEmojiPicker && (
          <div
            style={{
              position: "absolute",
              bottom: "80px",
              right: "20px",
              zIndex: 1000,
            }}
          >
            <Picker
              data={data}
              onEmojiSelect={(emoji) => setText((prev) => prev + emoji.native)}
              theme="dark"
            />
          </div>
        )}

        <IoSend className="send" onClick={sendMessage} />
      </div>
    </div>
  );
};
