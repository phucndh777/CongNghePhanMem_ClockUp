import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  useNavigate,
  useParams,
} from "react-router-dom";

import { supabase } from "../lib/supabase";
import { requireLogin } from "../utils/auth";

function Home({ session }) {
  const navigate = useNavigate();

  const [posts, setPosts] = useState([]);
  const [content, setContent] = useState("");
  const [comments, setComments] = useState({});
  const [likedPosts, setLikedPosts] = useState({});
  const [likeCounts, setLikeCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [likingPostId, setLikingPostId] = useState(null);

  useEffect(() => {
    loadPosts();
  }, [session?.user?.id]);

  async function loadPosts() {
    const { data, error } = await supabase
      .from("posts")
      .select(`
        *,
        profiles (
          id,
          username,
          display_name,
          avatar_url
        )
      `)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error("LOAD POSTS ERROR:", error);
      alert(`Không thể tải bài viết: ${error.message}`);
      return;
    }

    const postList = data || [];
    setPosts(postList);

    // Load comments and likes after loading the posts.
    await Promise.all(
      postList.map((post) => loadComments(post.id))
    );

    await loadPostLikes(postList);
  }

  async function loadComments(postId) {
    const { data, error } = await supabase
      .from("comments")
      .select(`
        *,
        profiles (
          username,
          display_name
        )
      `)
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("LOAD COMMENTS ERROR:", error);
      return;
    }

    setComments((old) => ({
      ...old,
      [postId]: data || [],
    }));
  }

  async function loadPostLikes(postList) {
    const postIds = postList.map((post) => post.id);

    if (postIds.length === 0) {
      setLikeCounts({});
      setLikedPosts({});
      return;
    }

    const { data, error } = await supabase
      .from("post_reactions")
      .select("post_id, user_id, reaction")
      .in("post_id", postIds)
      .eq("reaction", "like");

    if (error) {
      console.error("LOAD LIKES ERROR:", error);
      return;
    }

    const counts = {};
    const mine = {};

    for (const reaction of data || []) {
      counts[reaction.post_id] =
        (counts[reaction.post_id] || 0) + 1;

      if (session?.user?.id === reaction.user_id) {
        mine[reaction.post_id] = true;
      }
    }

    setLikeCounts(counts);
    setLikedPosts(mine);
  }

  async function createPost(e) {
    e.preventDefault();

    if (!session) {
      requireLogin(navigate);
      return;
    }

    if (!content.trim()) {
      alert("Hãy nhập nội dung bài viết!");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from("posts")
        .insert({
          author_id: session.user.id,
          content: content.trim(),
        });

      if (error) {
        alert(error.message);
        return;
      }

      setContent("");
      await loadPosts();
    } catch (err) {
      console.error("CREATE POST ERROR:", err);
      alert("Có lỗi xảy ra khi đăng bài!");
    } finally {
      setLoading(false);
    }
  }

  async function createComment(postId) {
    if (!session) {
      requireLogin(navigate);
      return;
    }

    const text = (comments[`input-${postId}`] || "").trim();

    if (!text) return;

    // Tìm bài viết để biết chủ bài đăng là ai.
    const post = posts.find((item) => item.id === postId);

    if (!post) {
      alert("Không tìm thấy bài viết!");
      return;
    }

    const { data, error } = await supabase
      .from("comments")
      .insert({
        post_id: postId,
        author_id: session.user.id,
        content: text,
      })
      .select(`
        *,
        profiles (
          username,
          display_name
        )
      `)
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    // Cập nhật bình luận ngay trên giao diện.
    setComments((old) => ({
      ...old,
      [`input-${postId}`]: "",
      [postId]: [...(old[postId] || []), data],
    }));

    // Nếu người bình luận không phải chủ bài viết,
    // tạo thông báo cho chủ bài viết.
    if (post.author_id !== session.user.id) {
      const commenterName =
        data?.profiles?.display_name ||
        data?.profiles?.username ||
        "Một người dùng";

      const { error: notificationError } = await supabase
        .from("notifications")
        .insert({
          user_id: post.author_id,
          title: "💬 Có bình luận mới",
          body: text,
          is_read: false,
          type: "post_comment",
          post_id: postId,
          comment_id: data.id,
          actor_id: session.user.id,
        });

      if (notificationError) {
        // Bình luận đã được tạo thành công, nên chỉ log lỗi thông báo.
        console.error(
          "CREATE COMMENT NOTIFICATION ERROR:",
          notificationError
        );
      }
    }
  }

  async function toggleLike(postId) {
    if (!session) {
      requireLogin(navigate);
      return;
    }

    if (likingPostId === postId) return;

    const isLiked = !!likedPosts[postId];
    setLikingPostId(postId);

    // Optimistic UI: update the button and count immediately.
    setLikedPosts((old) => ({
      ...old,
      [postId]: !isLiked,
    }));

    setLikeCounts((old) => ({
      ...old,
      [postId]: Math.max(
        0,
        (old[postId] || 0) + (isLiked ? -1 : 1)
      ),
    }));

    try {
      if (isLiked) {
        const { error } = await supabase
          .from("post_reactions")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", session.user.id)
          .eq("reaction", "like");

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("post_reactions")
          .upsert(
            {
              post_id: postId,
              user_id: session.user.id,
              reaction: "like",
            },
            {
              onConflict: "post_id,user_id",
            }
          );

        if (error) throw error;

        // Thông báo cho chủ bài viết khi có người thích.
        const post = posts.find((item) => item.id === postId);
        if (post && post.author_id !== session.user.id) {
          const { data: actorProfile } = await supabase
            .from("profiles")
            .select("display_name, username")
            .eq("id", session.user.id)
            .single();

          const actorName =
            actorProfile?.display_name ||
            actorProfile?.username ||
            session.user.user_metadata?.display_name ||
            session.user.user_metadata?.username ||
            "Một người dùng";

          const { error: notificationError } = await supabase
            .from("notifications")
            .insert({
              user_id: post.author_id,
              title: "👍 Có lượt thích mới",
              body: `${actorName} đã thích bài viết của bạn.`,
              is_read: false,
              type: "post_like",
              post_id: postId,
              actor_id: session.user.id,
            });

          if (notificationError) {
            console.error(
              "CREATE LIKE NOTIFICATION ERROR:",
              notificationError
            );
          }
        }
      }
    } catch (err) {
      console.error("TOGGLE LIKE ERROR:", err);

      // Roll back optimistic UI when Supabase fails.
      setLikedPosts((old) => ({
        ...old,
        [postId]: isLiked,
      }));

      setLikeCounts((old) => ({
        ...old,
        [postId]: Math.max(
          0,
          (old[postId] || 0) + (isLiked ? 1 : -1)
        ),
      }));

      alert(`Không thể ${isLiked ? "bỏ thích" : "thích"} bài viết: ${err.message}`);
    } finally {
      setLikingPostId(null);
    }
  }

  return (
    <div className="feed">
      {/* HERO */}
      <section className="hero">
        <div>
          <h1>Chào mừng đến ConnectHub 👋</h1>
          <p>Mạng xã hội kết hợp Facebook, Reddit và Discord.</p>
        </div>

        {!session && (
          <span className="hint">
            Bạn có thể xem bài viết mà không cần đăng nhập.
          </span>
        )}
      </section>

      {/* CREATE POST */}
      <form className="card composer" onSubmit={createPost}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={
            session
              ? "Bạn đang nghĩ gì?"
              : "Đăng nhập để đăng bài..."
          }
        />

        <button className="btn" disabled={loading}>
          {loading ? "Đang đăng..." : "Đăng bài"}
        </button>
      </form>

      {/* POSTS */}
      {posts.length === 0 && (
        <div className="card">Chưa có bài đăng nào.</div>
      )}

      {posts.map((post) => {
        const isLiked = !!likedPosts[post.id];
        const currentLikeCount = likeCounts[post.id] || 0;
        const currentCommentCount = (comments[post.id] || []).length;

        return (
          <article className="card post" key={post.id}>
            <div className="post-head">
              <Link to={`/profile/${post.author_id}`}>
                <b>
                  {post.profiles?.display_name ||
                    post.profiles?.username ||
                    "Người dùng"}
                </b>
              </Link>

              <small>
                {new Date(post.created_at).toLocaleString("vi-VN")}
              </small>
            </div>

            <p className="post-content">{post.content}</p>

            {/* POST STATS */}
            <div className="post-stats">
              <span>
                👍 {currentLikeCount} {currentLikeCount === 1 ? "lượt thích" : "lượt thích"}
              </span>
              <span>
                💬 {currentCommentCount} {currentCommentCount === 1 ? "bình luận" : "bình luận"}
              </span>
            </div>

            {/* ACTIONS */}
            <div className="actions">
              <button
                className={isLiked ? "active" : ""}
                onClick={() => toggleLike(post.id)}
                disabled={likingPostId === post.id}
              >
                {isLiked ? "👍 Đã thích" : "👍 Thích"}
                <span className="action-count">{currentLikeCount}</span>
              </button>

              <button
                onClick={() => {
                  if (!session) {
                    requireLogin(navigate);
                    return;
                  }

                  document
                    .getElementById(`comment-${post.id}`)
                    ?.focus();
                }}
              >
                💬 Bình luận
                <span className="action-count">{currentCommentCount}</span>
              </button>

              <button
                onClick={() => {
                  if (!session) {
                    requireLogin(navigate);
                    return;
                  }

                  alert("Chức năng chia sẻ sẽ được bổ sung.");
                }}
              >
                🔗 Chia sẻ
              </button>
            </div>

            {/* COMMENTS */}
            <div className="comments">
              {(comments[post.id] || []).map((comment) => (
                <div className="comment" key={comment.id}>
                  <b>
                    {comment.profiles?.display_name ||
                      comment.profiles?.username ||
                      "Người dùng"}
                    :
                  </b>{" "}
                  {comment.content}
                </div>
              ))}
            </div>

            {/* COMMENT INPUT */}
            <form
              className="comment-box"
              onSubmit={(e) => {
                e.preventDefault();
                createComment(post.id);
              }}
            >
              <input
                id={`comment-${post.id}`}
                value={comments[`input-${post.id}`] || ""}
                onChange={(e) =>
                  setComments((old) => ({
                    ...old,
                    [`input-${post.id}`]: e.target.value,
                  }))
                }
                placeholder={
                  session
                    ? "Viết bình luận..."
                    : "Đăng nhập để bình luận..."
                }
              />

              <button className="btn small">Gửi</button>
            </form>
          </article>
        );
      })}
    </div>
  );
}

/* =========================================================
   LOGIN
========================================================= */

export default Home;
