import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  useNavigate,
  useParams,
} from "react-router-dom";

import { supabase } from "../lib/supabase";
import { requireLogin } from "../utils/auth";

function Admin({ profile }) {

  const [posts, setPosts] =
    useState([]);

  const [announcement, setAnnouncement] =
    useState("");

  const [maintenance, setMaintenance] =
    useState(false);

  useEffect(() => {

    if (profile?.is_admin) {
      loadPosts();
    }

  }, [profile]);

  async function loadPosts() {

    const { data } =
      await supabase
        .from("posts")
        .select(`
          *,
          profiles (
            username,
            display_name
          )
        `)
        .order(
          "created_at",
          {
            ascending: false,
          }
        );

    setPosts(data || []);
  }

  async function deletePost(id) {

    const confirmDelete =
      window.confirm(
        "Bạn có chắc muốn xóa bài viết này?"
      );

    if (!confirmDelete) return;

    const { error } =
      await supabase
        .from("posts")
        .delete()
        .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    loadPosts();
  }

  async function sendAnnouncement() {

    if (!announcement.trim()) {
      alert("Nhập nội dung!");
      return;
    }

    const { data: users } =
      await supabase
        .from("profiles")
        .select("id");

    if (!users) return;

    const notifications =
      users.map((user) => ({
        user_id: user.id,
        title:
          "📢 Thông báo toàn server",
        body:
          announcement,
      }));

    const { error } =
      await supabase
        .from("notifications")
        .insert(
          notifications
        );

    if (error) {
      alert(error.message);
      return;
    }

    setAnnouncement("");

    alert(
      "Đã gửi thông báo đến toàn server!"
    );
  }

  async function toggleMaintenance() {

    const next =
      !maintenance;

    await supabase
      .from("system_settings")
      .upsert({
        key: "maintenance",
        value: {
          enabled: next,
        },
      });

    setMaintenance(next);
  }

  if (!profile?.is_admin) {

    return (
      <div className="card">

        <h2>
          Không có quyền truy cập
        </h2>

        <p>
          Trang này chỉ dành cho Admin.
        </p>

      </div>
    );

  }

  return (
    <div>

      <h1>
        Admin Dashboard
      </h1>

      <div className="admin-grid">

        {/* MODERATION */}

        <section className="card">

          <h2>
            🛡️ Kiểm duyệt bài đăng
          </h2>

          <p className="hint">
            Admin có thể xem và xóa nội dung vi phạm.
          </p>

          {posts.map((post) => (

            <div
              className="moderate"
              key={post.id}
            >

              <div>

                <b>
                  {
                    post.profiles
                      ?.display_name ||
                    post.profiles
                      ?.username
                  }
                </b>

                <p>
                  {post.content}
                </p>

              </div>

              <button
                className="btn danger small"
                onClick={() =>
                  deletePost(post.id)
                }
              >
                Xóa
              </button>

            </div>

          ))}

        </section>

        {/* SYSTEM */}

        <section className="card">

          <h2>
            📢 Thông báo toàn server
          </h2>

          <textarea
            value={announcement}
            onChange={(e) =>
              setAnnouncement(
                e.target.value
              )
            }
            placeholder="Nhập thông báo..."
          />

          <br />
          <br />

          <button
            className="btn"
            onClick={
              sendAnnouncement
            }
          >
            Gửi thông báo
          </button>

          <hr />

          <h2>
            🔧 Bảo trì hệ thống
          </h2>

          <p>
            Trạng thái:{" "}
            <b>
              {maintenance
                ? "ĐANG BẢO TRÌ"
                : "ĐANG HOẠT ĐỘNG"}
            </b>
          </p>

          <button
            className="btn"
            onClick={
              toggleMaintenance
            }
          >
            {maintenance
              ? "Tắt bảo trì"
              : "Bật bảo trì"}
          </button>

        </section>

      </div>

    </div>
  );
}

/* =========================================================
   APP
========================================================= */

export default Admin;
