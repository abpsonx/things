# Facebook Login Flow — Setup Checklist

Setup ini one-time, dilakukan di **Meta For Developers Dashboard**.
App ID & Secret yang sama dgn Instagram Business Login bisa di-reuse.

## A. Meta Dev Dashboard — Aktifin Facebook Login Product

1. Buka https://developers.facebook.com/apps/ → pilih app Things
2. Sidebar kiri → **Add Product** → cari **Facebook Login** → Set Up
3. Setelah di-add, masuk **Facebook Login → Settings**:
   - **Valid OAuth Redirect URIs**: tambahin
     ```
     https://dothings.id/api/sosmed/oauth/facebook/callback
     ```
   - **Client OAuth Login**: ON
   - **Web OAuth Login**: ON
   - **Enforce HTTPS**: ON

## B. App Review — Minta Permission

Production mode butuh App Review buat scope berikut.
**Development mode (App Mode = Development)**: skip semua, langsung jalan
buat user yg di-set sebagai Admin/Developer/Tester.

Scope yang kita pake:

| Scope | Use case (untuk App Review form) |
|---|---|
| `pages_show_list` | List FB Pages user buat pilih mana yg link ke IG |
| `pages_read_engagement` | Baca engagement Page (insights akun brand) |
| `instagram_basic` | Profil IG dasar (username, follower, profile pic) |
| `instagram_content_publish` | Auto-post scheduler |
| `instagram_manage_comments` | Reply/hide comments dari dashboard |
| `instagram_manage_insights` | Insights post + akun |
| `instagram_manage_messages` | DM management |
| `business_management` | Akses Business Portfolio (buat Marketplace nanti) |

Submit lewat **App Review → Permissions and Features**. Per scope kasih:
- Use case description (1-2 paragraph)
- Screen recording demo flow (login → connect → fitur jalan)
- Test credentials kalau perlu

Tunggu 2-5 hari kerja per review.

## C. (Optional) Creator Marketplace Discovery

Buat unlock fitur **Marketplace tab di Creator Pool**, butuh scope tambahan:

```
instagram_creator_marketplace_discovery
```

Use case: discovery influencer Indonesia untuk campaign brand kami.

⚠️ Marketplace API adoption di Indonesia masih tipis (~ratusan creator
opted-in dari ratusan ribu total). Bisa di-submit kalau memang penting,
tapi expect hasil thin.

## D. Cek Hasil

Setelah Production mode hidup + App Review approved:

1. User klik tombol "Hubungkan via Facebook" di `/org/<id>/sosmed`
2. Redirect ke `facebook.com/v22.0/dialog/oauth?...`
3. User login FB + grant permission Pages + Instagram
4. Callback ke `/api/sosmed/oauth/facebook/callback`
5. Backend fetch list Pages → cari yg punya `instagram_business_account`
6. Simpan SocialAccount dgn `auth_type=fb_page` + Page access token
7. UI tampilin badge `FB` biru di account card
8. Discovery tab di Creator Pool — Hashtag & Marketplace mode auto-enabled

## E. Migrasi Akun Existing

Akun `@ngemilohsnack` (atau lainnya) yang udah connected via IG Business
Login **tetep jalan** untuk fitur dasar (post, insights, comments, DM).

Tapi untuk pakai fitur baru (hashtag search inline, marketplace, business
discovery), user harus klik tombol "Hubungkan via Facebook" lagi —
akan upsert SocialAccount yang sama (matched by external_id IG user)
dan flip `auth_type` jadi `fb_page`.

## F. Troubleshooting

| Error | Penyebab | Fix |
|---|---|---|
| `bad_state` | Token state expired/tampered | Klik Hubungkan lagi |
| `no_pages_admin` | User FB bukan admin Page mana pun | Setup FB Page dulu |
| `no_ig_linked` | Gak ada Page yg link ke IG | Di IG app: Settings → Account → Sharing to Other Apps → Facebook → Link |
| `token_exchange` | Code OAuth invalid / App ID/Secret salah | Cek env var, redirect URI di dashboard match exact |
| `network` | Timeout ke Meta | Retry |
