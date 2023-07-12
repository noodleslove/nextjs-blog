export default async function health(req, res) {
  res.status(200).json({ status: 'ok' })
}
