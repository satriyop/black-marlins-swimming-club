export function classifyQueryError(error: unknown): { denied: boolean; missing: boolean; message: string } {
  const message = error instanceof Error ? error.message : "Data belum berhasil dimuat.";
  const denied = /Tidak diizinkan|belum diundang/.test(message);
  const missing = /tidak ditemukan|Tidak ditemukan|tidak berlaku/i.test(message);
  return {
    denied,
    missing,
    message: denied
      ? "Anda tidak punya akses ke halaman ini. Masuk dengan akun yang diundang, atau kembali ke Hari Ini."
      : missing
        ? "Halaman ini sudah tidak ada. Mungkin sesi atau pengumuman dihapus."
        : message || "Data belum berhasil dimuat. Periksa koneksi lalu coba lagi.",
  };
}
