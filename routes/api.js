const express = require('express');
const router = express.Router();
const Address = require('../models/address');

function formatBalance(balance) {
  return (balance / 1e8).toFixed(4);
}

function formatPercent(p) {
  return p.toFixed(2) + '%';
}

router.get('/top-holder', async function (req, res) {
  try {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit) || 100, 1000));

    // Calculate total supply (only include positive balances)
    const totalAgg = await Address.aggregate([
      {
        $project: {
          balance: {
            $subtract: [
              { $ifNull: ["$received", 0] },
              { $ifNull: ["$sent", 0] }
            ]
          }
        }
      },
      { $match: { balance: { $gt: 0 } } }, // ✅ Only include positive balances
      {
        $group: {
          _id: null,
          total: { $sum: "$balance" }
        }
      }
    ]);

    const total = totalAgg.length > 0 ? totalAgg[0].total : 1; // ✅ Avoid divide by 0

    // Get top holders
    const topHolders = await Address.aggregate([
      {
        $project: {
          address: "$a_id", // use a_id as address
          balance: {
            $subtract: [
              { $ifNull: ["$received", 0] },
              { $ifNull: ["$sent", 0] }
            ]
          }
        }
      },
      { $match: { balance: { $gt: 0 } } },
      { $sort: { balance: -1 } },
      { $limit: limit }
    ]);

    const result = topHolders.map((entry, index) => ({
      rank: index + 1,
      address: entry.address,
      balance: formatBalance(entry.balance),
      percent: formatPercent((entry.balance / total) * 100),
    }));

    res.json(result);
  } catch (err) {
    console.error('Error in /top-holder:', err);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
