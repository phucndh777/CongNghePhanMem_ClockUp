import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  useNavigate,
  useParams,
} from "react-router-dom";

import { supabase } from "../lib/supabase";
import { requireLogin } from "../utils/auth";

function Friends({ session }) {

  const navigate = useNavigate();

  const [keyword, setKeyword] = useState("");
  const [users, setUsers] = useState([]);
  const [friends, setFriends] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    loadFriendsData();
  }, [session]);

  async function loadFriendsData() {
    setLoading(true);

    try {
      const myId = session.user.id;

      const { data: friendshipRows, error: friendshipError } =
        await supabase
          .from("friendships")
          .select("user_a,user_b")
          .or(`user_a.eq.${myId},user_b.eq.${myId}`);

      if (friendshipError) {
        throw friendshipError;
      }

      const friendIds = (friendshipRows || []).map((row) =>
        row.user_a === myId ? row.user_b : row.user_a
      );

      let friendProfiles = [];

      if (friendIds.length) {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .in("id", friendIds);

        if (error) throw error;
        friendProfiles = data || [];
      }

      const { data: incoming, error: incomingError } = await supabase
        .from("friend_requests")
        .select("id,sender_id,receiver_id,status,created_at,profiles:sender_id(id,username,display_name)")
        .eq("receiver_id", myId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (incomingError) throw incomingError;

      const { data: outgoing, error: outgoingError } = await supabase
        .from("friend_requests")
        .select("id,sender_id,receiver_id,status,created_at,profiles:receiver_id(id,username,display_name)")
        .eq("sender_id", myId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (outgoingError) throw outgoingError;

      setFriends(friendProfiles);
      setIncomingRequests(incoming || []);
      setOutgoingRequests(outgoing || []);
    } catch (error) {
      console.error("LOAD FRIENDS ERROR:", error);
      alert(`Không thể tải danh sách bạn bè: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function searchUsers() {
    if (!session) {
      requireLogin(navigate);
      return;
    }

    const cleanKeyword = keyword.trim();

    if (!cleanKeyword) {
      setUsers([]);
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .ilike("username", `%${cleanKeyword}%`)
      .neq("id", session.user.id)
      .limit(30);

    if (error) {
      alert(error.message);
      return;
    }

    setUsers(data || []);
  }

  async function followUser(userId) {
    if (!session) {
      requireLogin(navigate);
      return;
    }

    if (userId === session.user.id) return;

    const { error } = await supabase
      .from("follows")
      .upsert({
        follower_id: session.user.id,
        following_id: userId,
      });

    if (error) {
      alert(error.message);
    } else {
      alert("Đã theo dõi!");
    }
  }

  async function addFriend(userId) {
    if (!session) {
      requireLogin(navigate);
      return;
    }

    if (userId === session.user.id) return;

    const myId = session.user.id;

    const { data: existingFriendship, error: friendshipError } = await supabase
      .from("friendships")
      .select("user_a,user_b")
      .or(`and(user_a.eq.${myId},user_b.eq.${userId}),and(user_a.eq.${userId},user_b.eq.${myId})`)
      .limit(1);

    if (friendshipError) {
      alert(friendshipError.message);
      return;
    }

    if (existingFriendship?.length) {
      alert("Hai người đã là bạn bè!");
      return;
    }

    const { data: existingRequest, error: requestCheckError } = await supabase
      .from("friend_requests")
      .select("id,sender_id,receiver_id,status")
      .or(`and(sender_id.eq.${myId},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${myId})`)
      .eq("status", "pending")
      .limit(1);

    if (requestCheckError) {
      alert(requestCheckError.message);
      return;
    }

    if (existingRequest?.length) {
      if (existingRequest[0].sender_id === userId) {
        alert("Người này đã gửi lời mời cho anh. Anh hãy chấp nhận trong phần Bạn bè hoặc Thông báo.");
      } else {
        alert("Anh đã gửi lời mời kết bạn cho người này rồi!");
      }
      return;
    }

    const { data: request, error } = await supabase
      .from("friend_requests")
      .insert({
        sender_id: myId,
        receiver_id: userId,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("display_name,username")
      .eq("id", myId)
      .single();

    const senderName =
      senderProfile?.display_name ||
      senderProfile?.username ||
      "Một người dùng";

    const { error: notificationError } = await supabase
      .from("notifications")
      .insert({
        user_id: userId,
        title: "👥 Lời mời kết bạn",
        body: `${senderName} đã gửi lời mời kết bạn cho bạn.`,
        is_read: false,
        type: "friend_request",
        friend_request_id: request.id,
      });

    if (notificationError) {
      console.error("FRIEND REQUEST NOTIFICATION ERROR:", notificationError);
    }

    alert("Đã gửi lời mời kết bạn!");
    loadFriendsData();
  }

  async function acceptFriendRequest(requestId) {
    const { error } = await supabase.rpc("accept_friend_request", {
      p_request_id: requestId,
    });

    if (error) {
      alert(`Không thể chấp nhận lời mời: ${error.message}`);
      return;
    }

    alert("Đã trở thành bạn bè!");
    await loadFriendsData();
  }

  async function rejectFriendRequest(requestId) {
    const { error } = await supabase.rpc("reject_friend_request", {
      p_request_id: requestId,
    });

    if (error) {
      alert(`Không thể từ chối lời mời: ${error.message}`);
      return;
    }

    await loadFriendsData();
  }

  return (
    <div>
      <div className="hero">
        <div>
          <h1>Bạn bè</h1>
          <p className="hint">Quản lý bạn bè, lời mời và tìm người mới.</p>
        </div>
      </div>

      <section className="card">
        <h2>Lời mời kết bạn</h2>

        {incomingRequests.length === 0 ? (
          <p className="hint">Không có lời mời kết bạn mới.</p>
        ) : (
          incomingRequests.map((request) => {
            const user = request.profiles;
            const name = user?.display_name || user?.username || "Người dùng";

            return (
              <div className="user friend-request" key={request.id}>
                <div className="avatar">{name[0].toUpperCase()}</div>
                <div>
                  <Link to={`/profile/${request.sender_id}`}>
                    <b>{name}</b>
                  </Link>
                  <small>@{user?.username || "user"}</small>
                </div>
                <div className="user-actions">
                  <button
                    className="btn small"
                    onClick={() => acceptFriendRequest(request.id)}
                  >
                    Chấp nhận
                  </button>
                  <button
                    className="btn ghost small"
                    onClick={() => rejectFriendRequest(request.id)}
                  >
                    Từ chối
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>

      <section className="card">
        <h2>Bạn bè của tôi ({friends.length})</h2>

        {loading ? (
          <p>Đang tải danh sách bạn bè...</p>
        ) : friends.length === 0 ? (
          <p className="hint">Anh chưa có bạn bè. Hãy tìm người để kết bạn.</p>
        ) : (
          <div className="grid">
            {friends.map((user) => {
              const name = user.display_name || user.username || "Người dùng";

              return (
                <div className="card user" key={user.id}>
                  <div className="avatar">{name[0].toUpperCase()}</div>
                  <div>
                    <Link to={`/profile/${user.id}`}>
                      <b>{name}</b>
                    </Link>
                    <small>@{user.username}</small>
                  </div>
                  <Link className="btn small" to={`/messages?user=${user.id}`}>
                    Nhắn tin
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {outgoingRequests.length > 0 && (
        <section className="card">
          <h2>Đã gửi ({outgoingRequests.length})</h2>

          {outgoingRequests.map((request) => {
            const user = request.profiles;
            const name = user?.display_name || user?.username || "Người dùng";

            return (
              <div className="user" key={request.id}>
                <div className="avatar">{name[0].toUpperCase()}</div>
                <div>
                  <b>{name}</b>
                  <small>@{user?.username || "user"} · Đang chờ phản hồi</small>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section className="card">
        <h2>Tìm bạn</h2>

        <div className="searchbar">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") searchUsers();
            }}
            placeholder="Tìm username..."
          />
          <button className="btn" onClick={searchUsers}>
            Tìm
          </button>
        </div>

        <div className="grid">
          {users.map((user) => (
            <div className="card user" key={user.id}>
              <div className="avatar">
                {(user.display_name || user.username || "?")[0].toUpperCase()}
              </div>

              <div>
                <Link to={`/profile/${user.id}`}>
                  <b>{user.display_name || user.username}</b>
                </Link>
                <small>@{user.username}</small>
              </div>

              <div className="user-actions">
                <button
                  className="btn small"
                  onClick={() => addFriend(user.id)}
                >
                  Kết bạn
                </button>
                <button
                  className="btn ghost small"
                  onClick={() => followUser(user.id)}
                >
                  Theo dõi
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* =========================================================
   PROFILE
========================================================= */

export default Friends;
