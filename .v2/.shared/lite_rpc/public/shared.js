/**
 * Class mà abstract class cho service cần kế thừa
 * @abstract
 */
export class ServiceInterface {
	/**
	 * @protected
	 * @returns {never}
	 */
	abstract() {
		throw new Error(`Abstract method must be implemented`);
	}
}
