import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  useNavigate,
  useParams,
} from "react-router-dom";

import { supabase } from "../lib/supabase";
import { requireLogin } from "../utils/auth";

function Notifications({ session }) {

  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    loadNotifications();
  }, [session]);

  async function loadNotifications() {
    if (!session) return;

    const { data, error } = await supabase
      .from("notifications")
      .select(`
        *,
        actor:actor_id (
          id,
          username,
          display_name,
          avatar_url
        )
      `)
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("LOAD NOTIFICATIONS ERROR:", error);
      return;
    }

    setNotifications(data || []);

    // Mở trang thông báo = đã xem các thông báo hiện tại.
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", session.user.id)
      .eq("is_read", false);
  }

  async function acceptFriendRequest(notification) {
    if (!notification.friend_request_id) return;

    const { error } = await supabase.rpc("accept_friend_request", {
      p_request_id: notification.friend_request_id,
    });

    if (error) {
      alert(`Không thể chấp nhận lời mời: ${error.message}`);
      return;
    }

    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notification.id);

    setNotifications((old) =>
      old.filter((item) => item.id !== notification.id)
    );

    alert("Đã chấp nhận lời mời kết bạn!");
  }

  async function rejectFriendRequest(notification) {
    if (!notification.friend_request_id) return;

    const { error } = await supabase.rpc("reject_friend_request", {
      p_request_id: notification.friend_request_id,
    });

    if (error) {
      alert(`Không thể từ chối lời mời: ${error.message}`);
      return;
    }

    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notification.id);

    setNotifications((old) =>
      old.filter((item) => item.id !== notification.id)
    );
  }

  function getActorName(notification) {
    return (
      notification.actor?.display_name ||
      notification.actor?.username ||
      "Một người dùng"
    );
  }

  function formatLikeNotification(group) {
    const names = group
      .slice(0, 3)
      .map((item) => getActorName(item));

    if (group.length === 1) {
      return `${names[0]} đã thích bài viết của bạn.`;
    }

    if (group.length === 2) {
      return `${names[0]} và ${names[1]} đã thích bài viết của bạn.`;
    }

    if (group.length === 3) {
      return `${names[0]}, ${names[1]} và ${names[2]} đã thích bài viết của bạn.`;
    }

    return `${names[0]}, ${names[1]}, ${names[2]} và ${group.length - 3} người khác đã thích bài viết của bạn.`;
  }

  // Gom các lượt like của cùng một bài viết thành 1 thông báo kiểu Facebook.
  const groupedNotifications = [];
  const likeGroups = new Map();

  for (const notification of notifications) {
    if (notification.type === "post_like" && notification.post_id) {
      const key = notification.post_id;

      if (!likeGroups.has(key)) {
        const group = [];
        likeGroups.set(key, group);
        groupedNotifications.push({
          kind: "like_group",
          id: `like-${key}`,
          items: group,
        });
      }

      likeGroups.get(key).push(notification);
    } else {
      groupedNotifications.push({
        kind: "notification",
        id: notification.id,
        notification,
      });
    }
  }

  return (
    <div>
      <h1>Thông báo</h1>

      {groupedNotifications.length === 0 ? (
        <div className="card">
          Chưa có thông báo.
        </div>
      ) : (
        groupedNotifications.map((item) => {
          if (item.kind === "like_group") {
            const group = item.items;
            const latest = group[0];
            const count = group.length;

            return (
              <div className="card notification" key={item.id}>
                <h3>👍 Bài viết nhận được lượt thích</h3>
                <p>{formatLikeNotification(group)}</p>
                <div className="notification-like-count">
                  <strong>{count}</strong> lượt thích
                </div>
                <small>
                  {new Date(latest.created_at).toLocaleString("vi-VN")}
                </small>
              </div>
            );
          }

          const notification = item.notification;

          return (
            <div className="card notification" key={item.id}>
              <h3>{notification.title}</h3>

              {notification.type === "post_comment" ? (
                <div className="notification-comment">
                  <div className="notification-comment-author">
                    <b>{getActorName(notification)}</b> đã bình luận bài viết của bạn:
                  </div>
                  <div className="notification-comment-content">
                    “{notification.body}”
                  </div>
                </div>
              ) : (
                <p>{notification.body}</p>
              )}

              {notification.type === "friend_request" &&
                notification.friend_request_id && (
                  <div className="notification-actions">
                    <button
                      className="btn small"
                      onClick={() => acceptFriendRequest(notification)}
                    >
                      Chấp nhận
                    </button>
                    <button
                      className="btn ghost small"
                      onClick={() => rejectFriendRequest(notification)}
                    >
                      Từ chối
                    </button>
                  </div>
                )}

              <small>
                {new Date(notification.created_at).toLocaleString("vi-VN")}
              </small>
            </div>
          );
        })
      )}
    </div>
  );
}

/* =========================================================
   ROOMS + DISCORD STYLE CHAT
========================================================= */

export default Notifications;
