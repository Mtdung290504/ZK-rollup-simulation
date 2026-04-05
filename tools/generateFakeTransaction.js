import { buildPoseidon, buildEddsa } from 'circomlibjs';

/**
 * Hàm tạo dữ liệu giao dịch giả lập (Fake Transaction) cho mạch ZK-Rollup.
 * Tất cả các giá trị số đều được chuyển về định dạng String.
 * * @param {Buffer} prkSender - Private Key của người gửi (Buffer 32 bytes)
 * @param {Buffer} prkReceiver - Private Key của người nhận (Buffer 32 bytes)
 * @param {String | Number} amount - Số tiền chuyển
 * @param {String | Number} fee - Phí giao dịch
 * @param {String | Number} nonce - Số lần giao dịch của người gửi
 * @returns {Promise<Object>} - Object chứa input cho mạch Circom
 */
export default async function generateFakeTransaction(prkSender, prkReceiver, amount, fee, nonce) {
	const eddsa = await buildEddsa();
	const poseidon = await buildPoseidon();
	const F = poseidon.F;

	// 1. Tạo Public Key từ Private Key
	const pubSender = eddsa.prv2pub(prkSender);
	const pubReceiver = eddsa.prv2pub(prkReceiver);

	// 2. Tính Address của người nhận: Poseidon(pubX, pubY)
	const addrReceiverField = poseidon([pubReceiver[0], pubReceiver[1]]);
	const addrReceiverStr = F.toObject(addrReceiverField).toString();

	// 3. Chuẩn bị các giá trị BigInt
	const amountBI = BigInt(amount);
	const feeBI = BigInt(fee);
	const nonceBI = BigInt(nonce);

	// 4. Tạo Message Hash để ký (Thứ tự: [from_x, from_y, to_x, to_y, amount, fee, nonce])
	// Lưu ý: Thứ tự này phải khớp 100% với logic Hasher trong mạch Circom (VerifyTxSignature)
	const msgHash = poseidon([
		pubSender[0], pubSender[1],
		pubReceiver[0], pubReceiver[1],
		F.e(amountBI), F.e(feeBI), F.e(nonceBI)
	]);

	// 5. Ký thông điệp bằng EdDSA
	const signature = eddsa.signPoseidon(prkSender, msgHash);

	// 6. Trả về định dạng String cho tất cả các trường
	return {
		enabled: '1', // Mặc định là giao dịch thực hiện (không phải padding)
		sender_pubkey: [F.toObject(pubSender[0]).toString(), F.toObject(pubSender[1]).toString()],
		receiver_pubkey: [F.toObject(pubReceiver[0]).toString(), F.toObject(pubReceiver[1]).toString()],
		receiver_address: addrReceiverStr,
		amount: amountBI.toString(),
		fee: feeBI.toString(),
		nonce: nonceBI.toString(),
		signature_R8: [F.toObject(signature.R8[0]).toString(), F.toObject(signature.R8[1]).toString()],
		signature_S: signature.S.toString(),
	};
}
