jest.mock('pdfkit', () => {
	class FakePDFDocument {
		constructor() {
			this.page = {
				margins: { left: 48, top: 48, right: 48, bottom: 48 },
				width: 600,
			}
			this.y = 120
			this._handlers = {}
			this.actions = { text: [], rect: [], fill: [], stroke: [] }
			FakePDFDocument.instances.push(this)
		}

		on(event, handler) {
			this._handlers[event] = handler
			return this
		}

		_emit(event, payload) {
			if (this._handlers[event]) {
				this._handlers[event](payload)
			}
		}

		rect(...args) {
			this.actions.rect.push(args)
			return this
		}

		fill(...args) {
			this.actions.fill.push(args)
			return this
		}

		font() {
			return this
		}

		fontSize() {
			return this
		}

		fillColor() {
			return this
		}

		text(value) {
			this.actions.text.push(String(value))
			this.y += 12
			return this
		}

		moveDown(amount = 1) {
			this.y += amount * 12
			return this
		}

		lineWidth() {
			return this
		}

		strokeColor() {
			return this
		}

		stroke(...args) {
			this.actions.stroke.push(args)
			return this
		}

		moveTo() {
			return this
		}

		lineTo() {
			return this
		}

		end() {
			this._emit('data', Buffer.from('FAKE-PDF'))
			this._emit('end')
		}
	}

	FakePDFDocument.instances = []

	return FakePDFDocument
})

const FakePDFDocument = require('pdfkit')
const { generateSpecialCollectionReceipt } = require('../receipt')

describe('generateSpecialCollectionReceipt', () => {
	beforeEach(() => {
		FakePDFDocument.instances.length = 0
	})

	const slot = {
		start: new Date('2025-02-01T08:00:00.000Z'),
		end: new Date('2025-02-01T10:00:00.000Z'),
	}

	it('returns a PDF buffer containing key receipt details', async () => {
		const buffer = await generateSpecialCollectionReceipt({
			request: {
				_id: 'req-001',
				address: '123 Sample Street',
				district: 'Colombo',
				contactPhone: '0771234567',
				contactEmail: 'resident@example.com',
				residentName: 'Resident One',
				ownerName: 'Owner One',
				itemLabel: 'Furniture & bulky items',
				quantity: 2,
				approxWeightKg: 32.5,
				totalWeightKg: 65,
				paymentSubtotal: 2500,
				paymentWeightCharge: 750,
				paymentTaxCharge: 97.5,
				paymentAmount: 3347.5,
			},
			slot,
			issuedAt: new Date('2025-01-15T06:30:00.000Z'),
		})

		expect(Buffer.isBuffer(buffer)).toBe(true)
		expect(buffer.toString()).toBe('FAKE-PDF')

		const [doc] = FakePDFDocument.instances
		expect(doc.actions.text).toEqual(expect.arrayContaining([
			expect.stringContaining('Special Collection Receipt'),
			expect.stringContaining('Receipt reference: req-001'),
			expect.stringContaining('Resident: Resident One'),
			expect.stringContaining('Owner: Owner One'),
			expect.stringContaining('Furniture & bulky items'),
			expect.stringContaining('Total paid'),
		]))
		expect(doc.actions.text.some(text => text.includes('3,347.50'))).toBe(true)
	})

	it('applies placeholders when optional fields are missing', async () => {
		const buffer = await generateSpecialCollectionReceipt({
			request: {
				_id: 'req-002',
				quantity: null,
				paymentAmount: null,
				paymentSubtotal: null,
				paymentWeightCharge: null,
				paymentTaxCharge: null,
			},
			slot: { start: null, end: null },
			issuedAt: new Date('2025-01-15T06:30:00.000Z'),
		})

		expect(Buffer.isBuffer(buffer)).toBe(true)

		const [doc] = FakePDFDocument.instances
		expect(doc.actions.text).toEqual(expect.arrayContaining([
			expect.stringContaining('Address: —'),
			expect.stringContaining('District: —'),
			expect.stringContaining('Phone: —'),
			expect.stringContaining('Email: —'),
			expect.stringContaining('Resident: —'),
			expect.stringContaining('Owner: —'),
			expect.stringContaining('Item type: —'),
			expect.stringContaining('Quantity: —'),
		]))
	})
})
