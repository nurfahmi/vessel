const router = require('express').Router();
const vc = require('../controllers/voyageController');

router.get('/', vc.index);
router.get('/test-lookup', vc.testLookup);

// Destinations
router.post('/destinations', vc.createDestination);
router.put('/destinations/:id', vc.updateDestination);
router.delete('/destinations/:id', vc.deleteDestination);

// Transit times
router.post('/transit', vc.createTransit);
router.put('/transit/:id', vc.updateTransit);
router.delete('/transit/:id', vc.deleteTransit);

// Port areas
router.post('/areas', vc.createArea);
router.put('/areas/:id', vc.updateArea);
router.delete('/areas/:id', vc.deleteArea);

// Aliases
router.post('/aliases', vc.createAlias);
router.put('/aliases/:id', vc.updateAlias);
router.delete('/aliases/:id', vc.deleteAlias);

// Discharge settings
router.post('/discharge', vc.createDischarge);
router.put('/discharge/:id', vc.updateDischarge);
router.delete('/discharge/:id', vc.deleteDischarge);

module.exports = router;
