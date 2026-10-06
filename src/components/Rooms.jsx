import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  useNavigate,
  useParams,
} from "react-router-dom";

import { supabase } from "../lib/supabase";
import { requireLogin } from "../utils/auth";

function Rooms({ session }) {

  const navigate = useNavigate();

  const [rooms, setRooms] =
    useState([]);

  const [roomName, setRoomName] =
    useState("");

  const [activeRoom, setActiveRoom] =
    useState(null);

  const [channels, setChannels] =
    useState([]);

  const [activeChannel, setActiveChannel] =
    useState(null);

  const [messages, setMessages] =
    useState([]);

  const [message, setMessage] =
    useState("");

  useEffect(() => {

    loadRooms();

  }, []);

  async function loadRooms() {

    const { data } =
      await supabase
        .from("rooms")
        .select("*")
        .order(
          "created_at",
          { ascending: false }
        );

    setRooms(data || []);
  }

  async function createRoom() {

    if (!session) {
      requireLogin(navigate);
      return;
    }

    if (!roomName.trim()) {
      alert("Nhập tên room!");
      return;
    }

    const { data, error } =
      await supabase
        .from("rooms")
        .insert({
          owner_id:
            session.user.id,
          name:
            roomName.trim(),
        })
        .select()
        .single();

    if (error) {
      alert(error.message);
      return;
    }

    setRoomName("");

    loadRooms();

    openRoom(data);
  }

  async function openRoom(room) {

    setActiveRoom(room);

    const { data } =
      await supabase
        .from("room_channels")
        .select("*")
        .eq(
          "room_id",
          room.id
        )
        .order("created_at");

    setChannels(data || []);

    if (data?.length) {
      openChannel(data[0]);
    }
  }

  async function openChannel(channel) {

    setActiveChannel(channel);

    const { data } =
      await supabase
        .from("messages")
        .select(`
          *,
          profiles (
            username,
            display_name
          )
        `)
        .eq(
          "channel_id",
          channel.id
        )
        .order("created_at");

    setMessages(data || []);

    const realtime =
      supabase
        .channel(
          `channel-${channel.id}`
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter:
              `channel_id=eq.${channel.id}`,
          },
          async (payload) => {

            const { data: sender } =
              await supabase
                .from("profiles")
                .select(
                  "username,display_name"
                )
                .eq(
                  "id",
                  payload.new.sender_id
                )
                .single();

            setMessages((old) => [
              ...old,
              {
                ...payload.new,
                profiles: sender,
              },
            ]);
          }
        )
        .subscribe();

    return () => {
      supabase.removeChannel(
        realtime
      );
    };
  }

  async function sendMessage() {

    if (!session) {
      requireLogin(navigate);
      return;
    }

    if (!activeChannel) return;

    if (!message.trim()) return;

    const { error } =
      await supabase
        .from("messages")
        .insert({
          channel_id:
            activeChannel.id,
          sender_id:
            session.user.id,
          content:
            message.trim(),
        });

    if (error) {
      alert(error.message);
      return;
    }

    setMessage("");
  }

  return (
    <div className="rooms">

      <h1>
        Discord Rooms
      </h1>

      <div className="room-layout">

        {/* ROOM LIST */}

        <aside className="card sidebar">

          <div className="row">

            <input
              value={roomName}
              onChange={(e) =>
                setRoomName(e.target.value)
              }
              placeholder="Tên room..."
            />

            <button
              className="btn small"
              onClick={createRoom}
            >
              +
            </button>

          </div>

          <hr />

          {rooms.map((room) => (

            <button
              className="room-btn"
              key={room.id}
              onClick={() =>
                openRoom(room)
              }
            >
              💬 {room.name}
            </button>

          ))}

        </aside>

        {/* CHAT */}

        <section className="card chat">

          <h2>
            {activeRoom
              ? activeRoom.name
              : "Chọn một room"}
          </h2>

          <div className="channels">

            {channels.map((channel) => (

              <button
                key={channel.id}
                className={
                  activeChannel?.id ===
                  channel.id
                    ? "active"
                    : ""
                }
                onClick={() =>
                  openChannel(channel)
                }
              >
                # {channel.name}
              </button>

            ))}

          </div>

          <div className="messages">

            {messages.map((msg) => (

              <div
                className="message"
                key={msg.id}
              >

                <b>
                  {
                    msg.profiles
                      ?.display_name ||
                    msg.profiles
                      ?.username ||
                    "Người dùng"
                  }
                </b>

                <span>
                  {msg.content}
                </span>

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
              placeholder="Nhập tin nhắn..."
            />

            <button
              className="btn"
              onClick={sendMessage}
            >
              Gửi
            </button>

          </div>

        </section>

      </div>

    </div>
  );
}

/* =========================================================
   DIRECT MESSAGE
========================================================= */

export default Rooms;
