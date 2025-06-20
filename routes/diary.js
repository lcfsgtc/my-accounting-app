const path = require('path');
const querystring = require('querystring');
const multer = require('multer');
const fs = require('fs').promises; // For deleting files
const ExcelJS = require('exceljs'); // 用于导出Excel
module.exports = (app, Diary, requireLogin, mongoose, path, querystring,upload) => {

    // 日记列表页面
    app.get('/diary', requireLogin, async (req, res) => {
        try {
            const userId = req.session.userId;
            const page = parseInt(req.query.page) || 1; // 当前页码，默认为1
            const limit = parseInt(req.query.limit) || 10; // 每页显示数量，默认为10
            const skip = (page - 1) * limit; // 跳过多少条记录
            const searchQuery = req.query.searchQuery || ''; // 获取搜索关键字
            const startDate = req.query.startDate || ''; // 获取开始日期
            const endDate = req.query.endDate || '';     // 获取结束日期            
           // 构建查询条件
            let query = { userId: new mongoose.Types.ObjectId(userId) };
            // 添加模糊搜索条件
            if (searchQuery) {
                const searchRegex = new RegExp(searchQuery, 'i'); // 'i' 表示不区分大小写
                query.$or = [
                    { 'planList': { $in: [searchRegex] } }, // 搜索 planList 数组中的元素
                    { 'eventList': { $in: [searchRegex] } }, // 搜索 eventList 数组中的元素
                    { 'summary': searchRegex },
                    { 'title': searchRegex } // 同时搜索标题
                ];
            }
            if (startDate || endDate) {
                query.date = {}; // 初始化日期查询对象
                if (startDate) {
                    const start = new Date(startDate);
                    start.setUTCHours(0, 0, 0, 0); // 设置为当天的开始（UTC时间）
                    query.date.$gte = start;
                }
                if (endDate) {
                    const end = new Date(endDate);
                    end.setUTCHours(23, 59, 59, 999); // 设置为当天的结束（UTC时间）
                    query.date.$lte = end;
                }
            }
            // 获取总记录数
            const totalDiaries = await Diary.countDocuments(query);
            const totalPages = Math.ceil(totalDiaries / limit); // 计算总页数                                    
            //const diaries = await Diary.find({ userId: new mongoose.Types.ObjectId(userId) }).sort({ date: 'desc' });
            // 获取当前页的日记数据
            const diaries = await Diary.find(query)
                                        .sort({ date: 'desc' }) // 按日期降序排列
                                        .skip(skip)
                                        .limit(limit)
                                        .lean(); // 使用 .lean() 提高查询性能  
            const currentQueryParams = {
                searchQuery: searchQuery,
                startDate: startDate,
                endDate: endDate,
                // 如果您还有其他筛选参数，也请添加到这里
            };

            // 过滤掉空值、undefined 和与分页直接相关的参数（page和limit）
            const filteredQueryParams = Object.keys(currentQueryParams)
                .filter(key => currentQueryParams[key] !== '' && currentQueryParams[key] !== undefined);

            const queryString = filteredQueryParams
                .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(currentQueryParams[key])}`)
                .join('&');                                        
                                        
            res.render('diary/index', { 
                activeMenu: 'diary',
                layout: 'diary/layout.ejs',
                title: '日记列表',
                pageTitle: '日记列表',                
                diaries: diaries,
                currentPage: page,
                totalPages: totalPages,
                limit: limit,
                searchQuery: searchQuery, // 传递搜索关键字给模板
                startDate: startDate,     // 传递开始日期给模板
                endDate: endDate,         // 传递结束日期给模板
                queryString: queryString, // 传递 queryString 给模板
                success_msg: req.flash('success_msg'), // 传递 flash 消息
                error_msg: req.flash('error_msg'),                
                path: path,
                __dirname: __dirname,
                basedir: path.join(__basedir, 'views') 
            });
        } catch (err) {
            //console.error(err);
            console.error("Error fetching diary list with pagination:", err);
            req.flash('error_msg', '获取日记列表失败。');            
            res.status(500).send('Server Error');
        }
    });
    // 查看日记
    app.get('/diary/view/:id', requireLogin, async (req, res) => {
        try {
            const diary = await Diary.findById(req.params.id);
            res.render('diary/view', { 
                activeMenu: 'diary',
                layout: 'diary/layout.ejs',
                title: '查看日记',
                pageTitle: '查看日记',  
                success_msg: req.flash('success_msg'), // 传递 flash 消息
                error_msg: req.flash('error_msg'),                  
                diary: diary ,
                path: path, __dirname: __dirname,
                basedir: path.join(__basedir,'views')
            });
        } catch (err) {
            console.error(err);
            res.status(500).send('Server Error');
        }
    });
    // 日记添加页面
    app.get('/diary/add', requireLogin, (req, res) => {
        res.render('diary/add',{
            activeMenu: 'diary',
            layout: 'diary/layout.ejs',
            title: '新增日记',
            pageTitle: '新增日记',  
            success_msg: req.flash('success_msg'), // 传递 flash 消息
            error_msg: req.flash('error_msg'),            
        });
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
                location:  location || '',
                people: people ? people.split(',') : [],
                tags: tags ? tags.split(',') : [],                
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
            res.render('diary/edit', {
                activeMenu: 'diary',
                layout: 'diary/layout.ejs',
                title: '编辑日记',
                pageTitle: '编辑日记',  
                success_msg: req.flash('success_msg'), // 传递 flash 消息
                error_msg: req.flash('error_msg'),                  
                diary: diary,
                path: path,
                __dirname: __dirname,
                basedir: path.join(__dirname, 'views') 
            });
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
            const { startDate, endDate, mood, weather, location, tags, period, publicOnly } = req.query;
            const userId = req.session.userId;

            let match = { userId: new mongoose.Types.ObjectId(String(userId)) };

            // 1. 时间段过滤
            if (startDate && endDate) {
                const start = new Date(startDate);
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999); // 确保包含结束日期的全天
                match.date = { $gte: start, $lte: end };
            }

            // 2. 心情过滤
            if (mood) {
                match.mood = mood;
            }

            // 3. 天气过滤
            if (weather) {
                match.weather = weather;
            }

            // 4. 地点过滤 (精确匹配)
            if (location) {
                match.location = location;
            }

            // 5. 标签过滤 (至少包含一个指定标签)
            if (tags) {
                const tagsArray = Array.isArray(tags) ? tags : tags.split(',').map(tag => tag.trim()).filter(tag => tag);
                if (tagsArray.length > 0) {
                    match.tags = { $in: tagsArray };
                }
            }

            // 6. 公开/私人日记过滤
            if (publicOnly === 'on') {
                match.isPublic = true;
            }

            // 构建聚合管道
            let pipeline = [ { $match: match } ];

            // 根据是否按时间维度分组，决定第一个 $group 阶段的 _id
            let groupById = null; // 默认整体统计
            if (period === 'year') {
                groupById = { year: { $year: '$date' } };
            } else if (period === 'month') {
                groupById = { year: { $year: '$date' }, month: { $month: '$date' } };
            } else if (period === 'day') {
                groupById = { year: { $year: '$date' }, month: { $month: '$date' }, day: { $dayOfMonth: '$date' } };
            }

            // 第一个 $group 阶段：收集所有需要统计的原始数据
            pipeline.push({
                $group: {
                    _id: groupById,
                    totalDiaries: { $sum: 1 },
                    allMoods: { $push: '$mood' }, // 收集所有心情
                    allWeathers: { $push: '$weather' }, // 收集所有天气
                    allLocations: { $push: '$location' }, // 收集所有地点
                    allTagsArrays: { $push: '$tags' } // 收集所有标签数组 (例如: [["tag1", "tag2"], ["tag3"]])
                }
            });

            // 第二个 $project 阶段：计算各种分布的频率
            pipeline.push({
                $project: {
                    _id: '$_id', // 保留分组ID
                    totalDiaries: 1,
                    // 计算心情分布
                    moodDistribution: {
                        $filter: { // 过滤掉空字符串的心情
                            input: {
                                $map: {
                                    input: { $setUnion: '$allMoods' }, // 获取所有唯一的心情
                                    as: 'm',
                                    in: {
                                        mood: '$$m',
                                        count: {
                                            $size: {
                                                $filter: {
                                                    input: '$allMoods',
                                                    as: 'item',
                                                    cond: { $eq: ['$$item', '$$m'] }
                                                }
                                            }
                                        }
                                    }
                                }
                            },
                            as: 'moodItem',
                            cond: { $ne: ['$$moodItem.mood', ''] } // 确保心情值不为空字符串
                        }
                    },
                    // 计算天气分布
                    weatherDistribution: {
                        $filter: { // 过滤掉空字符串的天气
                            input: {
                                $map: {
                                    input: { $setUnion: '$allWeathers' },
                                    as: 'w',
                                    in: {
                                        weather: '$$w',
                                        count: {
                                            $size: {
                                                $filter: {
                                                    input: '$allWeathers',
                                                    as: 'item',
                                                    cond: { $eq: ['$$item', '$$w'] }
                                                }
                                            }
                                        }
                                    }
                                }
                            },
                            as: 'weatherItem',
                            cond: { $ne: ['$$weatherItem.weather', ''] }
                        }
                    },
                    // 计算地点分布
                    locationDistribution: {
                        $filter: { // 过滤掉空字符串的地点
                            input: {
                                $map: {
                                    input: { $setUnion: '$allLocations' },
                                    as: 'loc',
                                    in: {
                                        location: '$$loc',
                                        count: {
                                            $size: {
                                                $filter: {
                                                    input: '$allLocations',
                                                    as: 'item',
                                                    cond: { $eq: ['$$item', '$$loc'] }
                                                }
                                            }
                                        }
                                    }
                                }
                            },
                            as: 'locationItem',
                            cond: { $ne: ['$$locationItem.location', ''] }
                        }
                    },
                    // 计算标签分布：先扁平化 allTagsArrays，再计算频率
                    tagDistribution: {
                        $let: {
                            vars: {
                                // 扁平化 allTagsArrays，将所有标签合并到一个数组
                                flattenedTags: {
                                    $reduce: {
                                        input: '$allTagsArrays',
                                        initialValue: [],
                                        in: { $concatArrays: ['$$value', '$$this'] }
                                    }
                                }
                            },
                            in: {
                                $filter: { // 过滤掉空字符串的标签
                                    input: {
                                        $map: {
                                            input: { $setUnion: '$$flattenedTags' }, // 获取所有唯一的扁平化标签
                                            as: 't',
                                            in: {
                                                tag: '$$t',
                                                count: {
                                                    $size: {
                                                        $filter: {
                                                            input: '$$flattenedTags',
                                                            as: 'item',
                                                            cond: { $eq: ['$$item', '$$t'] }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    },
                                    as: 'tagItem',
                                    cond: { $ne: ['$$tagItem.tag', ''] }
                                }
                            }
                        }
                    }
                }
            });

            // 排序 (如果按时间分组)
            if (period === 'year') {
                pipeline.push({ $sort: { '_id.year': 1 } });
            } else if (period === 'month') {
                pipeline.push({ $sort: { '_id.year': 1, '_id.month': 1 } });
            } else if (period === 'day') {
                pipeline.push({ $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } });
            }


            const statistics = await Diary.aggregate(pipeline);

            // 格式化数据以供前端使用，特别是心情、天气、标签和地点分布
            // 实际上，现在聚合管道已经尽可能地格式化了，这里做一些清理和排序
            const formattedStatistics = statistics.map(item => {
                let formattedItem = { ...item };

                // 确保分布数据存在且是数组
                formattedItem.moodDistribution = Array.isArray(formattedItem.moodDistribution) ? formattedItem.moodDistribution : [];
                formattedItem.weatherDistribution = Array.isArray(formattedItem.weatherDistribution) ? formattedItem.weatherDistribution : [];
                formattedItem.locationDistribution = Array.isArray(formattedItem.locationDistribution) ? formattedItem.locationDistribution : [];
                formattedItem.tagDistribution = Array.isArray(formattedItem.tagDistribution) ? formattedItem.tagDistribution : [];

                // 对标签分布进行降序排序 (频率高的在前)
                formattedItem.tagDistribution.sort((a, b) => b.count - a.count);

                return formattedItem;
            });


            // 获取所有可能的心情、天气、地点和标签列表，用于前端的下拉选择器
            const allMoods = await Diary.distinct('mood', { userId: new mongoose.Types.ObjectId(String(userId)) });
            const allWeathers = await Diary.distinct('weather', { userId: new mongoose.Types.ObjectId(String(userId)) });
            const allLocations = await Diary.distinct('location', { userId: new mongoose.Types.ObjectId(String(userId)) });
            const allTags = await Diary.distinct('tags', { userId: new mongoose.Types.ObjectId(String(userId)) });


            res.render('diary/statistics', {
                activeMenu: 'diary',
                layout: 'diary/layout.ejs',
                title: '日记统计',
                pageTitle: '日记统计',  
                success_msg: req.flash('success_msg'), // 传递 flash 消息
                error_msg: req.flash('error_msg'),                 
                statistics: formattedStatistics,
                startDate: startDate || '',
                endDate: endDate || '',
                mood: mood || '',
                weather: weather || '',
                location: location || '',
                tags: tags || '', // 保持原始的 tags 字符串或数组
                period: period || '',
                publicOnly: publicOnly === 'on', // 传递布尔值
                allMoods: allMoods.filter(m => m), // 过滤空值
                allWeathers: allWeathers.filter(w => w), // 过滤空值
                allLocations: allLocations.filter(l => l), // 过滤空值
                allTags: allTags.filter(t => t), // 过滤空值
                //activeMenu: 'diaryStatistics', // 用于侧边栏高亮
                path: path,
                __dirname: __dirname,
                basedir: path.join(__dirname, 'views')
            });

        } catch (err) {
            console.error("Error fetching diary statistics:", err); // 更详细的错误日志
            res.status(500).send('Server Error: ' + err.message); // 返回错误信息到前端，方便调试
        }
    });  
    // 导出日记到 Excel
    app.get('/diary/export', requireLogin, async (req, res) => {
        try {
            const userId = req.session.userId;
            const diaries = await Diary.find({ userId: new mongoose.Types.ObjectId(userId) }).sort({ date: 'desc' });

            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('日记列表');

            // 设置列头
            worksheet.columns = [
                { header: '日期', key: 'date', width: 15 },
                { header: '标题', key: 'title', width: 30 },
                { header: '天气', key: 'weather', width: 10 },
                { header: '心情', key: 'mood', width: 10 },
                { header: '地点', key: 'location', width: 20 },
                { header: '相关人物', key: 'people', width: 25 },
                { header: '标签', key: 'tags', width: 25 },
                { header: '计划列表', key: 'planList', width: 40 },
                { header: '事件列表', key: 'eventList', width: 40 },
                { header: '感受', key: 'feeling', width: 50 },
                { header: '总结', key: 'summary', width: 50 },
                { header: '图片链接', key: 'imageUrls', width: 60 }
            ];

            // 添加数据行
            diaries.forEach(diary => {
                worksheet.addRow({
                    date: new Date(diary.date).toLocaleDateString('zh-CN'), // 格式化日期
                    title: diary.title,
                    weather: diary.weather,
                    mood: diary.mood,
                    location: diary.location,
                    people: diary.people ? diary.people.join(', ') : '', // 将数组转换为逗号分隔的字符串
                    tags: diary.tags ? diary.tags.join(', ') : '', // 将数组转换为逗号分隔的字符串
                    planList: diary.planList ? diary.planList.join('\n') : '', // 换行符分隔
                    eventList: diary.eventList ? diary.eventList.join('\n') : '', // 换行符分隔
                    feeling: diary.feeling,
                    summary: diary.summary,
                    imageUrls: diary.imageUrls ? diary.imageUrls.join('\n') : '' // 换行符分隔
                });
            });

            // 设置响应头，告诉浏览器这是一个 Excel 文件
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=' + encodeURIComponent('日记列表.xlsx'));

            // 将工作簿写入响应流
            await workbook.xlsx.write(res);
            res.end();

        } catch (err) {
            console.error("Error exporting diaries to Excel:", err);
            res.status(500).send('Server Error: ' + err.message);
        }
    });

}