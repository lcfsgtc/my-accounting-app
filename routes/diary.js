const path = require('path');
const querystring = require('querystring');
const multer = require('multer');
const fs = require('fs').promises; // For deleting files
module.exports = (app, Diary, requireLogin, mongoose, path, querystring,upload) => {

    // 日记列表页面
    app.get('/diary', requireLogin, async (req, res) => {
        try {
            const userId = req.session.userId;
            const diaries = await Diary.find({ userId: new mongoose.Types.ObjectId(userId) }).sort({ date: 'desc' });
            res.render('diary/index', { diaries: diaries,path: path, __dirname: __dirname, basedir: path.join(__basedir, 'views') });
        } catch (err) {
            console.error(err);
            res.status(500).send('Server Error');
        }
    });
    // 查看日记
    app.get('/diary/view/:id', requireLogin, async (req, res) => {
        try {
            const diary = await Diary.findById(req.params.id);
            res.render('diary/view', { diary: diary ,path: path, __dirname: __dirname, basedir: path.join(__basedir,'views')});
        } catch (err) {
            console.error(err);
            res.status(500).send('Server Error');
        }
    });
    // 日记添加页面
    app.get('/diary/add', requireLogin, (req, res) => {
        res.render('diary/add');
    });

    // 添加日记
    app.post('/diary/add', requireLogin, upload.array('images', 5),async (req, res) => {
       try {
            const { date, title, weather, mood, planList, eventList, feeling, summary, isPublic,location,people,tags } = req.body;//   imageUrls
            const userId = req.session.userId;
            //处理文件名
            let imageUrls= [];
            if (req.files && req.files.length > 0) {
              imageUrls = req.files.map(file => '/uploads/' + file.filename);
            }

            const newDiary = new Diary({
                date: date,
                title:  title || '无标题',
                weather: weather,
                mood: mood,
                //location: req.body.location || '',
                location:  location || '',
                //people: req.body.people ? req.body.people.split(',') : [], // 使用逗号分隔字符串并创建数组
                people: people ? people.split(',') : [],
                tags: tags ? tags.split(',') : [],                
                //tags: req.body.tags ? req.body.tags.split(',') : [],    // 支持多个标签
                planList: planList ? planList.split('\n') : [],   // 支持多行文本
                eventList: eventList ? eventList.split('\n') : [],  // 支持多行文本
                feeling:  feeling || '',
                summary: summary,
                imageUrls: imageUrls,//imageUrls ? imageUrls.split('\n') : [],  // 支持多行文本
                isPublic: isPublic === 'on',//convert to boolean
                userId: userId
            });
            await newDiary.save();
            res.redirect('/diary');
        } catch (err) {
            //console.error(err);
            console.error("Error creating diary entry:", err);
            res.status(500).send('Error creating diary entry.');
        }
    });

    // 日记编辑页面
    app.get('/diary/edit/:id', requireLogin, async (req, res) => {
        try {
            const diary = await Diary.findById(req.params.id);
            res.render('diary/edit', { diary: diary,path: path, __dirname: __dirname, basedir: path.join(__dirname, 'views') });
        } catch (err) {
            console.error(err);
            res.status(500).send('Server Error');
        }
    });

    // 更新日记
    app.post('/diary/edit/:id', requireLogin,upload.array('newImages', 5), async (req, res) => {
      try {
            const { date, title, weather, mood, planList, eventList, feeling, summary,isPublic, location, people, tags,existingImages } = req.body;
            const userId = req.session.userId;
            const diary = await Diary.findById(req.params.id);//diaryId

            if (!diary) {
                return res.status(404).send('Diary not found');
            }

            // 1. Handle Deletion of Existing Images
            let existingImageUrls = diary.imageUrls || []; // Get existing URLs
            const imagesToDelete = req.body.deleteImages ? (Array.isArray(req.body.deleteImages) ? req.body.deleteImages : [req.body.deleteImages]) : []; // Ensure it's always an array

            //remove
            if (imagesToDelete && imagesToDelete.length > 0) {
                for (const imageUrl of imagesToDelete) {
                    // Delete the file from the server
                    try {
                        const filePath = path.join(__dirname, '../public', imageUrl);  // Adjust path as needed
                        await fs.unlink(filePath);
                        console.log(`Deleted file: ${filePath}`);

                        // Remove the image URL from the existingImageUrls array
                        existingImageUrls = existingImageUrls.filter(url => url !== imageUrl);

                    } catch (deleteErr) {
                        console.error(`Error deleting file ${imageUrl}:`, deleteErr);
                        // Don't stop the process if one file fails to delete.  Log and continue.
                    }
                }
            }
            // 2. Handle New Image Uploads
            let newImageUrls = [];
            if (req.files && req.files.length > 0) {
                newImageUrls = req.files.map(file => '/uploads/' + file.filename);
            }

            // 3. Combine Existing and New Images
            const allImageUrls = [...existingImageUrls, ...newImageUrls];

            // Update the diary entry
            diary.date = date;
            diary.title = title || '无标题';
            diary.weather = weather;
            diary.mood = mood;
            diary.location = location || '';
            diary.people = people ? people.split(',') : [];
            diary.tags = tags ? tags.split(',') : [];
            diary.planList = planList ? planList.split('\n') : [];
            diary.eventList = eventList ? eventList.split('\n') : [];
            diary.feeling = feeling || '';
            diary.summary = summary;
            diary.imageUrls = allImageUrls; // Assign the combined array
            diary.isPublic = isPublic === 'on';

            await diary.save(); // Save the updated diary
            /*await Diary.findByIdAndUpdate(req.params.id, {
                date: date,
                title:  title || '无标题',
                weather: weather,
                mood: mood,
                location: req.body.location || '',
                people: req.body.people ? req.body.people.split(',') : [], // 使用逗号分隔字符串并创建数组
                tags: req.body.tags ? req.body.tags.split(',') : [],    // 支持多个标签
                planList: planList ? planList.split('\n') : [],   // 支持多行文本
                eventList: eventList ? eventList.split('\n') : [],  // 支持多行文本
                feeling:  feeling || '',
                summary: summary,
                imageUrls: imageUrls ? imageUrls.split('\n') : [],  // 支持多行文本
                isPublic: isPublic === 'on'//convert to boolean
            });*/
            res.redirect('/diary');
        } catch (err) {
            console.error("Error updating diary:", err);
            res.status(500).send('Server Error');
        }
    });

    // 删除日记
    app.post('/diary/delete/:id', requireLogin, async (req, res) => {
        try {
            await Diary.findByIdAndDelete(req.params.id);
            res.redirect('/diary');
        } catch (err) {
            console.error(err);
            res.status(500).send('Server Error');
        }
    });
    // 日记统计路由
    app.get('/diary/statistics', requireLogin, async (req, res) => {
        try {
            const { startDate, endDate, mood} = req.query;
            const userId = req.session.userId;

            let match = { userId: new mongoose.Types.ObjectId(String(userId)) };

            // 时间段过滤
            if (startDate && endDate) {
                match.date = {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                };
            }
            if (mood) {
                match.mood = mood;
            }

            const pipeline = [
                { $match: match },
                {
                    $group: {
                        _id: null,
                        totalDiaries: { $sum: 1 } ,
                        totalMoods: { $addToSet: '$mood' }
                    }
                }
            ];

            const statistics = await Diary.aggregate(pipeline);

            res.render('diary/statistics', { statistics: statistics,startDate, endDate, mood,path: path, __dirname: __dirname, basedir: path.join(__dirname, 'views') });
        } catch (err) {
            console.error(err);
            res.status(500).send('Server Error');
        }
    });
}