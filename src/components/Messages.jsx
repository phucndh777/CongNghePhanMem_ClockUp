import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  useNavigate,
  useParams,
} from "react-router-dom";

import { supabase } from "../lib/supabase";
import { requireLogin } from "../utils/auth";

function Messages({ session }) {

  const navigate = useNavigate();

  const [users, setUsers] =
    useState([]);

  const [keyword, setKeyword] =
    useState("");

  const [selectedUser, setSelectedUser] =
    useState(null);

  const [message, setMessage] =
    useState("");

  const [messages, setMessages] =
    useState([]);

  async function searchUsers() {

    if (!session) {
      requireLogin(navigate);
      return;
    }

    const { data } =
      await supabase
        .from("profiles")
        .select("*")
        .ilike(
          "username",
          `%${keyword}%`
        )
        .neq(
          "id",
          session.user.id
        )
        .limit(20);

    setUsers(data || []);
  }

  async function openChat(user) {

    setSelectedUser(user);

    /*
      Bản MVP sử dụng conversations/messages
      riêng nếu anh tạo thêm bảng.
    */

    alert(
      "Khung DM đã sẵn sàng. Tiếp theo có thể kết nối bảng conversations."
    );
  }

  async function sendMessage() {

    if (!session) {
      requireLogin(navigate);
      return;
    }

    if (!selectedUser) return;

    if (!message.trim()) return;

    /*
      Có thể nối vào bảng direct_messages
      khi thêm schema riêng.
    */

    setMessages((old) => [
      ...old,
      {
        id: Date.now(),
        sender_id:
          session.user.id,
        content:
          message,
      },
    ]);

    setMessage("");
  }

  return (
    <div>

      <h1>
        Tin nhắn
      </h1>

      <div className="searchbar">

        <input
          value={keyword}
          onChange={(e) =>
            setKeyword(e.target.value)
          }
          placeholder="Tìm người để nhắn..."
        />

        <button
          className="btn"
          onClick={searchUsers}
        >
          Tìm
        </button>

      </div>

      <div className="card">

        {users.map((user) => (

          <div
            className="user"
            key={user.id}
          >

            <div className="avatar">
              {(
                user.display_name ||
                user.username
              )[0].toUpperCase()}
            </div>

            <div>

              <b>
                {
                  user.display_name ||
                  user.username
                }
              </b>

              <small>
                @{user.username}
              </small>

            </div>

            <button
              className="btn small"
              onClick={() =>
                openChat(user)
              }
            >
              Nhắn tin
            </button>

          </div>

        ))}

      </div>

      {selectedUser && (

        <div className="card">

          <h2>
            Chat với{" "}
            {
              selectedUser.display_name ||
              selectedUser.username
            }
          </h2>

          <div className="messages">

            {messages.map((msg) => (

              <div
                className="message"
                key={msg.id}
              >
                {msg.content}
              </div>

            ))}

          </div>

          <div className="message-box">

            <input
              value={message}
              onChange={(e) =>
                setMessage(e.target.value)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  sendMessage();
                }
              }}
            />

            <button
              className="btn"
              onClick={sendMessage}
            >
              Gửi
            </button>

          </div>

        </div>

      )}

    </div>
  );
}

/* =========================================================
   ADMIN
========================================================= */

export default Messages;
