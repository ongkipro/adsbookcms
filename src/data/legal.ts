export const legalPages = {
  privacy: {
    badge: 'Kebijakan Privasi',
    title: 'Kebijakan Privasi {{store}}',
    description:
      'Penjelasan tentang data yang dapat diproses saat Anda mengunjungi toko atau membuat pesanan di {{store}}.',
    sections: [
      {
        title: 'Data Pesanan',
        paragraphs: [
          'Saat Anda membuat pesanan, sistem dapat memproses nama, nomor telepon atau WhatsApp, alamat pengiriman, item pesanan, metode pembayaran, dan catatan yang Anda kirimkan.',
          'Data tersebut digunakan untuk mencatat pesanan, menghubungi Anda mengenai pesanan, dan menjalankan proses pembayaran atau pengiriman yang tersedia.',
        ],
      },
      {
        title: 'Data Teknis dan Atribusi',
        paragraphs: [
          'Sistem dapat memproses alamat IP, informasi browser dan perangkat, halaman yang dibuka, serta identifier atribusi iklan atau cookie jika fitur terkait diaktifkan oleh pengelola toko.',
          'Pengaturan browser dapat digunakan untuk membatasi atau menghapus cookie. Pembatasan tersebut dapat memengaruhi fungsi atribusi atau preferensi yang bergantung pada cookie.',
        ],
      },
      {
        title: 'Penyedia Layanan',
        paragraphs: [
          'Data yang diperlukan dapat diteruskan kepada penyedia pembayaran, logistik, customer service, analitik, atau platform iklan hanya ketika integrasi tersebut digunakan untuk menjalankan layanan toko.',
          'Masing-masing penyedia memproses data berdasarkan ketentuan dan kebijakan privasinya sendiri.',
        ],
      },
      {
        title: 'Keamanan dan Penyimpanan',
        paragraphs: [
          'Pengelola toko membatasi akses administratif dan menerapkan pengamanan teknis yang tersedia pada sistem. Tidak ada metode penyimpanan atau transmisi data yang sepenuhnya bebas risiko.',
          'Lama penyimpanan data dapat berbeda sesuai kebutuhan operasional, penyelesaian sengketa, pencegahan penyalahgunaan, dan kewajiban hukum yang berlaku.',
        ],
      },
      {
        title: 'Permintaan Terkait Data',
        paragraphs: [
          'Permintaan akses, koreksi, atau penghapusan data dapat diajukan melalui kontak customer service yang dipublikasikan oleh pengelola toko. Permintaan dapat memerlukan verifikasi identitas dan tetap tunduk pada kewajiban penyimpanan yang berlaku.',
        ],
      },
    ],
  },
  shipping: {
    badge: 'Pengiriman & Retur',
    title: 'Informasi Pengiriman & Retur {{store}}',
    description:
      'Informasi umum mengenai ketersediaan pengiriman, estimasi kurir, COD, dan pengajuan retur di {{store}}.',
    sections: [
      {
        title: 'Ketersediaan Pengiriman',
        paragraphs: [
          'Pilihan kurir, layanan, biaya, dan ketersediaan pengiriman bergantung pada alamat tujuan, berat pesanan, serta konfigurasi toko saat pesanan dibuat.',
          'Pesanan diproses setelah data pesanan dikonfirmasi. Status pemrosesan dan nomor resi, jika tersedia, akan dicatat pada pesanan.',
        ],
      },
      {
        title: 'Estimasi dan Pelacakan',
        paragraphs: [
          'Estimasi waktu tiba berasal dari penyedia logistik dan bukan jaminan tanggal penerimaan. Cuaca, hari libur, kapasitas kurir, serta kondisi wilayah dapat memengaruhi waktu pengiriman.',
          'Gunakan nomor resi yang diberikan untuk memeriksa status pada kanal pelacakan kurir terkait.',
        ],
      },
      {
        title: 'Bayar di Tempat (COD)',
        paragraphs: [
          'COD hanya tersedia jika tujuan, kurir, layanan, dan produk memenuhi aturan yang aktif saat pesanan dibuat. Ketersediaan akhir ditampilkan atau dikonfirmasi dalam proses pemesanan.',
        ],
      },
      {
        title: 'Pengajuan Retur',
        paragraphs: [
          'Hubungi customer service sebelum mengirim barang kembali. Sertakan nomor pesanan, alasan pengajuan, dan bukti kondisi barang agar pengelola dapat memeriksa kelayakan retur.',
          'Persetujuan, alamat pengembalian, biaya kirim, bentuk penyelesaian, dan batas waktu pengajuan akan dikonfirmasi berdasarkan kondisi pesanan serta kebijakan yang disampaikan pengelola toko.',
        ],
      },
    ],
  },
  tos: {
    badge: 'Syarat & Ketentuan',
    title: 'Syarat dan Ketentuan {{store}}',
    description:
      'Ketentuan penggunaan storefront, pengiriman data pesanan, harga, stok, dan perubahan pesanan di {{store}}.',
    sections: [
      {
        title: 'Penggunaan Storefront',
        paragraphs: [
          'Dengan menggunakan storefront dan mengirim pesanan, Anda menyatakan bahwa data yang diberikan akurat serta dapat digunakan untuk memproses pesanan tersebut.',
          'Anda tidak boleh mengirim pesanan fiktif, menyalahgunakan formulir, mengganggu layanan, atau menggunakan storefront untuk kegiatan yang melanggar hukum.',
        ],
      },
      {
        title: 'Produk, Harga, dan Stok',
        paragraphs: [
          'Harga ditampilkan dalam Rupiah kecuali dinyatakan lain. Pilihan produk, varian, harga, promo, dan stok dapat berubah sebelum pesanan dikonfirmasi.',
          'Jika produk atau layanan tidak tersedia, pengelola toko dapat menghubungi Anda untuk perubahan pesanan atau pembatalan sebelum pengiriman.',
        ],
      },
      {
        title: 'Perubahan dan Pembatalan Pesanan',
        paragraphs: [
          'Permintaan perubahan atau pembatalan harus diajukan melalui customer service. Kemungkinan perubahan bergantung pada status pemrosesan, pembayaran, dan penyerahan paket kepada penyedia logistik.',
        ],
      },
      {
        title: 'Hukum yang Berlaku',
        paragraphs: [
          'Ketentuan ini ditafsirkan berdasarkan hukum yang berlaku di Republik Indonesia. Ketentuan khusus yang disampaikan saat transaksi berlaku bersama halaman ini.',
        ],
      },
    ],
  },
  disclaimer: {
    badge: 'Disclaimer',
    title: 'Disclaimer {{store}}',
    description:
      'Batas penggunaan informasi produk, harga, ketersediaan, dan estimasi yang ditampilkan di storefront.',
    sections: [
      {
        title: 'Informasi Storefront',
        paragraphs: [
          'Informasi produk berasal dari katalog yang diterbitkan pengelola toko. Periksa pilihan varian, harga, stok, dan detail pesanan sebelum mengirim formulir.',
          'Ketersediaan produk, tarif, estimasi pengiriman, dan hasil penggunaan dapat berubah sesuai kondisi transaksi dan penyedia layanan terkait.',
        ],
      },
    ],
  },
  contact: {
    badge: 'Kontak',
    title: 'Kontak {{store}}',
    description:
      'Informasi kontak customer service yang dipublikasikan oleh pengelola {{store}}.',
    sections: [
      {
        title: 'Customer Service',
        paragraphs: [
          'Gunakan kontak berikut untuk pertanyaan produk, pesanan, pengiriman, pembayaran, atau pengajuan retur.',
          'WhatsApp CS: {{whatsapp}}',
        ],
      },
    ],
  },
};

export interface LegalPageContext {
  storeName?: string;
  supportWhatsapp?: string;
}

/**
 * Legal copy is shipped as a template so a fresh install renders its own
 * identity instead of the name it was cloned from. Any paragraph whose
 * placeholder cannot be resolved is dropped rather than shown half-filled.
 */
export function getTenantLegalPage(
  key: keyof typeof legalPages,
  storeName?: string,
  context: LegalPageContext = {},
) {
  const page = legalPages[key];
  const store = storeName || context.storeName || 'Toko Kami';
  const whatsapp = context.supportWhatsapp?.trim() || '';
  const fill = (value: string) =>
    value.replaceAll('{{store}}', store).replaceAll('{{whatsapp}}', whatsapp);

  if (key === 'contact' && !whatsapp) {
    return {
      ...page,
      title: fill(page.title),
      description: 'Pengelola toko belum mempublikasikan kontak customer service.',
      sections: [
        {
          title: 'Kontak Belum Tersedia',
          paragraphs: [
            'Nomor WhatsApp customer service belum dikonfigurasi oleh pengelola toko.',
          ],
        },
      ],
    };
  }

  return {
    ...page,
    title: fill(page.title),
    description: fill(page.description),
    sections: page.sections
      .map((section) => ({
        ...section,
        title: fill(section.title),
        paragraphs: section.paragraphs
          .filter((paragraph) => whatsapp || !paragraph.includes('{{whatsapp}}'))
          .map(fill),
      }))
      .filter((section) => section.paragraphs.length > 0),
  };
}
